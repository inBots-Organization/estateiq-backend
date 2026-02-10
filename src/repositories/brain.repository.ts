import { injectable, inject } from 'tsyringe';
import { PrismaClient, BrainDocument } from '@prisma/client';
import {
  IBrainRepository,
  CreateBrainDocumentData,
  CreateBrainChunkData,
  VectorSearchResult,
} from './interfaces/brain.repository.interface';

const SYSTEM_DEFAULT_ORG = 'system-default';

@injectable()
export class BrainRepository implements IBrainRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  // ─── Documents ──────────────────────────────────────────

  async createDocument(data: CreateBrainDocumentData): Promise<BrainDocument> {
    return this.prisma.brainDocument.create({ data });
  }

  async getDocumentById(id: string): Promise<BrainDocument | null> {
    return this.prisma.brainDocument.findUnique({ where: { id } });
  }

  async getDocumentsByOrg(
    organizationId: string,
    options?: {
      includeSystemDefaults?: boolean;
      status?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ documents: BrainDocument[]; total: number }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    // Build org filter: own docs + optionally system defaults
    const orgFilter: string[] = [organizationId];
    if (options?.includeSystemDefaults !== false) {
      orgFilter.push(SYSTEM_DEFAULT_ORG);
    }

    const where: Record<string, unknown> = {
      organizationId: { in: orgFilter },
    };
    if (options?.status) {
      where.status = options.status;
    }

    const [documents, total] = await Promise.all([
      this.prisma.brainDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.brainDocument.count({ where }),
    ]);

    return { documents, total };
  }

  async updateDocumentStatus(
    id: string,
    status: string,
    chunkCount?: number,
    errorMessage?: string
  ): Promise<BrainDocument> {
    const data: Record<string, unknown> = { status };
    if (chunkCount !== undefined) data.chunkCount = chunkCount;
    if (errorMessage !== undefined) data.errorMessage = errorMessage;

    return this.prisma.brainDocument.update({
      where: { id },
      data,
    });
  }

  async deleteDocument(id: string): Promise<void> {
    // Chunks cascade-delete via onDelete: Cascade
    await this.prisma.brainDocument.delete({ where: { id } });
  }

  async countDocumentsByOrg(organizationId: string): Promise<number> {
    return this.prisma.brainDocument.count({
      where: { organizationId },
    });
  }

  async findByOrgAndFileName(organizationId: string, fileName: string): Promise<BrainDocument | null> {
    return this.prisma.brainDocument.findUnique({
      where: {
        organizationId_fileName: {
          organizationId,
          fileName,
        },
      },
    });
  }

  // ─── Chunks ─────────────────────────────────────────────

  async insertChunks(chunks: CreateBrainChunkData[]): Promise<number> {
    if (chunks.length === 0) return 0;

    // Use raw SQL for inserting chunks with vector embeddings
    // Prisma Client cannot handle pgvector types natively
    let insertedCount = 0;

    // Batch insert in groups of 50 to avoid query size limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      // Build parameterized VALUES clause
      const values: unknown[] = [];
      const placeholders: string[] = [];

      batch.forEach((chunk, idx) => {
        const offset = idx * 6;
        placeholders.push(
          `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4}::int, $${offset + 5}, $${offset + 6}::vector)`
        );
        values.push(
          chunk.id || crypto.randomUUID(),
          chunk.documentId,
          chunk.organizationId,
          chunk.chunkIndex,
          chunk.content,
          `[${chunk.embedding.join(',')}]`,
        );
      });

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO brain_chunks (id, document_id, organization_id, chunk_index, content, embedding, metadata, created_at)
         VALUES ${placeholders.map(p => `(${p.slice(1, -1)}, '{}', NOW())`).join(', ')}`,
        ...values
      );

      insertedCount += batch.length;
    }

    return insertedCount;
  }

  async deleteChunksByDocument(documentId: string): Promise<number> {
    const result = await this.prisma.brainChunk.deleteMany({
      where: { documentId },
    });
    return result.count;
  }

  // ─── Vector Search ──────────────────────────────────────

  async searchByEmbedding(
    embedding: number[],
    organizationId: string,
    topK: number,
    scoreThreshold: number
  ): Promise<VectorSearchResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;

    // Cosine similarity: 1 - cosine_distance
    // pgvector <=> operator returns cosine distance (0 = identical, 2 = opposite)
    const results = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      content: string;
      score: number;
      document_id: string;
      chunk_index: number;
      metadata: string;
    }>>(
      `SELECT
        bc.id,
        bc.content,
        (1 - (bc.embedding <=> $1::vector)) as score,
        bc.document_id,
        bc.chunk_index,
        bc.metadata
      FROM brain_chunks bc
      WHERE bc.organization_id IN ($2, $3)
        AND bc.embedding IS NOT NULL
        AND (1 - (bc.embedding <=> $1::vector)) >= $4
      ORDER BY bc.embedding <=> $1::vector
      LIMIT $5`,
      embeddingStr,
      organizationId,
      SYSTEM_DEFAULT_ORG,
      scoreThreshold,
      topK
    );

    return results.map(r => ({
      id: r.id,
      content: r.content,
      score: Number(r.score),
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      metadata: r.metadata,
    }));
  }
}
