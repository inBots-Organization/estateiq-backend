// ─── AI Brain Service Interface ───────────────────────────

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type ContentLevel = 'beginner' | 'intermediate' | 'advanced' | 'professional' | 'general';

export interface BrainDocumentSummary {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  chunkCount: number;
  isSystemDefault: boolean;
  uploadedBy: string;
  errorMessage?: string | null;
  contentLevel: ContentLevel;
  targetPersona?: string | null;
  tags: string[];
  createdAt: Date;
}

// ─── Upload Document ──────────────────────────────────────

export interface UploadDocumentInput {
  file: Buffer;
  fileName: string;
  mimeType: string;
  organizationId: string;
  uploadedBy: string;
  contentLevel?: ContentLevel;
  targetPersona?: string;
  tags?: string[];
}

export interface UploadDocumentOutput {
  documentId: string;
  title: string;
  status: 'processing';
}

// ─── List Documents ───────────────────────────────────────

export interface ListDocumentsInput {
  organizationId: string;
  includeSystemDefaults?: boolean;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListDocumentsOutput {
  documents: BrainDocumentSummary[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Delete Document ──────────────────────────────────────

export interface DeleteDocumentInput {
  documentId: string;
  organizationId: string;
  userRole: string;
}

export interface DeleteDocumentOutput {
  deleted: boolean;
  chunksRemoved: number;
}

// ─── Query Brain (RAG Retrieval) ──────────────────────────

export interface QueryBrainInput {
  query: string;
  organizationId: string;
  topK?: number;
  scoreThreshold?: number;
}

export interface RetrievalResult {
  content: string;
  score: number;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
}

export interface QueryBrainOutput {
  results: RetrievalResult[];
  totalChunksSearched: number;
}

// ─── Service Interface ────────────────────────────────────

export interface IBrainService {
  uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentOutput>;
  listDocuments(input: ListDocumentsInput): Promise<ListDocumentsOutput>;
  deleteDocument(input: DeleteDocumentInput): Promise<DeleteDocumentOutput>;
  queryBrain(input: QueryBrainInput): Promise<QueryBrainOutput>;
}
