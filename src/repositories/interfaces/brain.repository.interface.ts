import { BrainDocument, BrainChunk } from '@prisma/client';

export interface CreateBrainDocumentData {
  organizationId: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  gcsPath?: string;
  uploadedBy: string;
  metadata?: string;
}

export interface CreateBrainChunkData {
  id?: string;
  documentId: string;
  organizationId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata?: string;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  documentId: string;
  chunkIndex: number;
  metadata: string;
}

export interface IBrainRepository {
  // ─── Documents ────────────────────────────────────────
  createDocument(data: CreateBrainDocumentData): Promise<BrainDocument>;
  getDocumentById(id: string): Promise<BrainDocument | null>;
  getDocumentsByOrg(
    organizationId: string,
    options?: {
      includeSystemDefaults?: boolean;
      status?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ documents: BrainDocument[]; total: number }>;
  updateDocumentStatus(id: string, status: string, chunkCount?: number, errorMessage?: string): Promise<BrainDocument>;
  deleteDocument(id: string): Promise<void>;
  countDocumentsByOrg(organizationId: string): Promise<number>;
  findByOrgAndFileName(organizationId: string, fileName: string): Promise<BrainDocument | null>;

  // ─── Chunks ───────────────────────────────────────────
  insertChunks(chunks: CreateBrainChunkData[]): Promise<number>;
  deleteChunksByDocument(documentId: string): Promise<number>;

  // ─── Vector Search ────────────────────────────────────
  searchByEmbedding(
    embedding: number[],
    organizationId: string,
    topK: number,
    scoreThreshold: number
  ): Promise<VectorSearchResult[]>;
}
