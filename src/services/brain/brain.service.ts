import { injectable, inject } from 'tsyringe';
import {
  IBrainService,
  UploadDocumentInput,
  UploadDocumentOutput,
  ListDocumentsInput,
  ListDocumentsOutput,
  DeleteDocumentInput,
  DeleteDocumentOutput,
  QueryBrainInput,
  QueryBrainOutput,
  BrainDocumentSummary,
} from '../interfaces/brain.interface';
import { IBrainRepository } from '../../repositories/interfaces/brain.repository.interface';
import { GeminiEmbeddingProvider } from '../../providers/embedding/gemini-embedding.provider';
import { parseDocument, isSupportedFileType } from '../../utils/document-parser';
import { chunkText } from '../../utils/text-chunker';

const SYSTEM_DEFAULT_ORG = 'system-default';
const MAX_DOCUMENTS_PER_ORG = 50;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

@injectable()
export class BrainService implements IBrainService {
  constructor(
    @inject('BrainRepository') private brainRepo: IBrainRepository,
    @inject(GeminiEmbeddingProvider) private embeddingProvider: GeminiEmbeddingProvider
  ) {}

  // ─── Upload & Process Document ────────────────────────────

  async uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentOutput> {
    const { file, fileName, mimeType, organizationId, uploadedBy, contentLevel, targetPersona, teacherId, tags } = input;

    // Validate file type
    if (!isSupportedFileType(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}. Only PDF, DOCX, and TXT are accepted.`);
    }

    // Validate file size
    if (file.length > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${(file.length / 1024 / 1024).toFixed(1)}MB. Maximum is 25MB.`);
    }

    // Check document limit per org
    const docCount = await this.brainRepo.countDocumentsByOrg(organizationId);
    if (docCount >= MAX_DOCUMENTS_PER_ORG) {
      throw new Error(`Document limit reached (${MAX_DOCUMENTS_PER_ORG}). Delete old documents to upload new ones.`);
    }

    // Check for duplicate filename
    const existing = await this.brainRepo.findByOrgAndFileName(organizationId, fileName);
    if (existing) {
      throw new Error(`A document named "${fileName}" already exists. Delete it first or use a different name.`);
    }

    // Derive title from filename
    const title = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    // Determine file type
    const fileType = mimeType.includes('pdf') ? 'pdf'
      : mimeType.includes('wordprocessing') ? 'docx'
      : 'txt';

    // Create document record (status: processing)
    const document = await this.brainRepo.createDocument({
      organizationId,
      title,
      fileName,
      fileType,
      fileSize: file.length,
      uploadedBy,
      contentLevel: contentLevel || 'general',
      targetPersona: targetPersona || null,
      teacherId: teacherId || null,
      tags: tags || [],
    });

    // Process async (don't block the upload response)
    this.processDocument(document.id, organizationId, file, mimeType).catch(err => {
      console.error(`[BrainService] Failed to process document ${document.id}:`, err);
    });

    return {
      documentId: document.id,
      title,
      status: 'processing',
    };
  }

  /**
   * Background processing: parse → chunk → embed → store
   */
  private async processDocument(
    documentId: string,
    organizationId: string,
    file: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      // Step 1: Parse document
      console.log(`[BrainService] Parsing document ${documentId}...`);
      const parsed = await parseDocument(file, mimeType);

      if (!parsed.text || parsed.text.length < 10) {
        throw new Error('Document is empty or too short to process.');
      }

      // Step 2: Chunk text
      console.log(`[BrainService] Chunking ${parsed.text.length} chars...`);
      const chunks = chunkText(parsed.text, {
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      if (chunks.length === 0) {
        throw new Error('No text chunks could be extracted from the document.');
      }

      console.log(`[BrainService] Generated ${chunks.length} chunks. Generating embeddings...`);

      // Step 3: Generate embeddings
      const texts = chunks.map(c => c.content);
      const embeddings = await this.embeddingProvider.generateEmbeddings(texts);

      // Step 4: Store chunks with embeddings
      console.log(`[BrainService] Storing ${chunks.length} chunks with embeddings...`);
      const chunkData = chunks.map((chunk, i) => ({
        documentId,
        organizationId,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: embeddings[i],
        metadata: JSON.stringify(chunk.metadata),
      }));

      const insertedCount = await this.brainRepo.insertChunks(chunkData);

      // Step 5: Mark document as ready
      await this.brainRepo.updateDocumentStatus(documentId, 'ready', insertedCount);

      console.log(`[BrainService] Document ${documentId} ready. ${insertedCount} chunks indexed.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown processing error';
      console.error(`[BrainService] Document ${documentId} processing failed:`, errorMessage);

      await this.brainRepo.updateDocumentStatus(documentId, 'failed', 0, errorMessage);
    }
  }

  // ─── List Documents ───────────────────────────────────────

  async listDocuments(input: ListDocumentsInput): Promise<ListDocumentsOutput> {
    const page = input.page || 1;
    const limit = input.limit || 50;

    const { documents, total } = await this.brainRepo.getDocumentsByOrg(
      input.organizationId,
      {
        includeSystemDefaults: input.includeSystemDefaults,
        status: input.status,
        page,
        limit,
      }
    );

    const summaries: BrainDocumentSummary[] = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      status: doc.status as BrainDocumentSummary['status'],
      chunkCount: doc.chunkCount,
      isSystemDefault: doc.organizationId === SYSTEM_DEFAULT_ORG,
      uploadedBy: doc.uploadedBy,
      errorMessage: doc.errorMessage,
      contentLevel: (doc.contentLevel || 'general') as BrainDocumentSummary['contentLevel'],
      targetPersona: doc.targetPersona || null,
      teacherId: doc.teacherId || null,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
    }));

    return {
      documents: summaries,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Delete Document ──────────────────────────────────────

  async deleteDocument(input: DeleteDocumentInput): Promise<DeleteDocumentOutput> {
    const document = await this.brainRepo.getDocumentById(input.documentId);

    if (!document) {
      throw new Error('Document not found.');
    }

    // Authorization: must own the document or be super admin
    if (document.organizationId === SYSTEM_DEFAULT_ORG) {
      if (input.userRole !== 'saas_super_admin') {
        throw new Error('Only super admins can delete system default documents.');
      }
    } else if (document.organizationId !== input.organizationId) {
      throw new Error('You do not have permission to delete this document.');
    }

    // Delete chunks (cascades via Prisma) and the document
    const chunksRemoved = await this.brainRepo.deleteChunksByDocument(input.documentId);
    await this.brainRepo.deleteDocument(input.documentId);

    return { deleted: true, chunksRemoved };
  }

  // ─── Query Brain (RAG Retrieval) ──────────────────────────

  async queryBrain(input: QueryBrainInput): Promise<QueryBrainOutput> {
    const { query, organizationId, topK = 5, scoreThreshold = 0.3 } = input;

    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty.');
    }

    // Generate query embedding (uses RETRIEVAL_QUERY task type for better matching)
    const queryEmbedding = await this.embeddingProvider.generateQueryEmbedding(query);

    // Search vector store
    const results = await this.brainRepo.searchByEmbedding(
      queryEmbedding,
      organizationId,
      topK,
      scoreThreshold
    );

    // Enrich with document titles
    const enrichedResults = await Promise.all(
      results.map(async (r) => {
        const doc = await this.brainRepo.getDocumentById(r.documentId);
        return {
          content: r.content,
          score: r.score,
          documentId: r.documentId,
          documentTitle: doc?.title || 'Unknown Document',
          chunkIndex: r.chunkIndex,
        };
      })
    );

    return {
      results: enrichedResults,
      totalChunksSearched: results.length,
    };
  }
}
