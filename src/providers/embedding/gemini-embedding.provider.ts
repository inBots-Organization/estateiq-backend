import { injectable } from 'tsyringe';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Use gemini-embedding-001 which is the available embedding model
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_MODEL_FULL = `models/${EMBEDDING_MODEL}`;
const EMBEDDING_DIMENSION = 768;

export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}

/**
 * Gemini Embedding Provider
 * Uses gemini-embedding-001 (768 dimensions) via REST API.
 * Same pattern as the existing GeminiLLMProvider — no SDK needed.
 */
@injectable()
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error('GEMINI_API_KEY is not configured. Required for AI Brain embeddings.');
      }
      this.apiKey = key;
    }
    return this.apiKey;
  }

  getDimension(): number {
    return EMBEDDING_DIMENSION;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = this.getApiKey();

    // Gemini batch embedding API — up to 100 texts per request
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const embeddings = await this.batchEmbed(batch, apiKey);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  private async batchEmbed(texts: string[], apiKey: string): Promise<number[][]> {
    const requests = texts.map(text => ({
      model: EMBEDDING_MODEL_FULL,
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSION,
    }));

    // Log the request for debugging
    console.log(`[GeminiEmbedding] Calling batchEmbedContents with ${texts.length} texts`);

    const response = await fetch(
      `${GEMINI_API_BASE}/${EMBEDDING_MODEL_FULL}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GeminiEmbedding] API error: ${response.status}`, error);
      throw new Error(`Gemini Embedding API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      embeddings: Array<{ values: number[] }>;
    };

    if (!result.embeddings || result.embeddings.length !== texts.length) {
      throw new Error(`Expected ${texts.length} embeddings, got ${result.embeddings?.length || 0}`);
    }

    return result.embeddings.map(e => e.values);
  }

  /**
   * Generate embedding for a search query (different task type for better retrieval)
   */
  async generateQueryEmbedding(text: string): Promise<number[]> {
    const apiKey = this.getApiKey();

    console.log(`[GeminiEmbedding] Calling embedContent for query`);

    const response = await fetch(
      `${GEMINI_API_BASE}/${EMBEDDING_MODEL_FULL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL_FULL,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: EMBEDDING_DIMENSION,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GeminiEmbedding] Query API error: ${response.status}`, error);
      throw new Error(`Gemini Embedding API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      embedding: { values: number[] };
    };

    return result.embedding.values;
  }
}
