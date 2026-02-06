import { injectable } from 'tsyringe';
import { ILLMProvider, LLMCompletionOptions, LLMCompletionResult } from './llm-provider.interface';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Gemini LLM Provider for low-latency AI Teacher responses
 * Uses gemini-2.0-flash for near-instantaneous responses
 */
@injectable()
export class GeminiLLMProvider implements ILLMProvider {
  private apiKey: string | null = null;

  private getApiKey(): string {
    if (!this.apiKey) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      this.apiKey = key;
    }
    return this.apiKey;
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const result = await this.completeWithMetadata(options);
    return result.content;
  }

  async completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { prompt, systemPrompt, maxTokens = 1024, temperature = 0.7 } = options;
    const apiKey = this.getApiKey();

    // Build the request body
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Add user message
    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    // Add system instruction if provided
    if (systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as GeminiStreamChunk;

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content: text,
      usage: result.usageMetadata
        ? {
            inputTokens: result.usageMetadata.promptTokenCount || 0,
            outputTokens: result.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }

  /**
   * Stream completion for real-time responses
   * Returns an async generator that yields text chunks
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncGenerator<string, void, unknown> {
    const { prompt, systemPrompt, maxTokens = 1024, temperature = 0.7 } = options;
    const apiKey = this.getApiKey();

    // Build the request body
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemPrompt) {
      requestBody.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/models/${DEFAULT_MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini streaming API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              return;
            }

            try {
              const json = JSON.parse(data) as GeminiStreamChunk;
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

              if (text) {
                yield text;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
