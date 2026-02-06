import { injectable } from 'tsyringe';
import { ILLMProvider, LLMCompletionOptions, LLMCompletionResult } from './llm-provider.interface';

/**
 * Groq LLM Provider - Uses Groq's FREE API tier
 * Groq provides free access to Llama models with generous rate limits
 *
 * Free tier: ~30 requests/min, 14,400 requests/day
 * Model: llama-3.3-70b-versatile (latest supported model)
 *
 * See available models: https://console.groq.com/docs/models
 */
@injectable()
export class GroqLLMProvider implements ILLMProvider {
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private model = 'llama-3.3-70b-versatile';

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY || '';
    if (!this.apiKey) {
      console.warn('GROQ_API_KEY not set - Groq provider will not work');
    }
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const result = await this.completeWithMetadata(options);
    return result.content;
  }

  async completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { prompt, systemPrompt, maxTokens = 1024, temperature = 0.7, responseFormat } = options;

    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: maxTokens,
          temperature,
          ...(responseFormat === 'json' && {
            response_format: { type: 'json_object' }
          }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Groq API error:', errorData);
        throw new Error(`Groq API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content || '';
      const usage = data.usage;

      return {
        content,
        usage: usage ? {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        } : undefined,
      };
    } catch (error) {
      console.error('Groq API request failed:', error);
      throw error;
    }
  }
}
