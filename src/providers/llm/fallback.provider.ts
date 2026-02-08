import { injectable } from 'tsyringe';
import { ILLMProvider, LLMCompletionOptions, LLMCompletionResult } from './llm-provider.interface';
import { GeminiLLMProvider } from './gemini.provider';
import { AnthropicLLMProvider } from './anthropic.provider';
import { GroqLLMProvider } from './groq.provider';

/**
 * Fallback LLM Provider
 *
 * Tries providers in order: Gemini (fast) → Claude (quality) → Groq (free backup)
 *
 * This ensures the AI Teacher always responds, even if one service is down.
 */
@injectable()
export class FallbackLLMProvider implements ILLMProvider {
  private geminiProvider: GeminiLLMProvider;
  private anthropicProvider: AnthropicLLMProvider;
  private groqProvider: GroqLLMProvider;

  // Track which providers are available
  private geminiAvailable: boolean;
  private anthropicAvailable: boolean;
  private groqAvailable: boolean;

  constructor() {
    this.geminiProvider = new GeminiLLMProvider();
    this.anthropicProvider = new AnthropicLLMProvider();
    this.groqProvider = new GroqLLMProvider();

    // Check which API keys are configured
    this.geminiAvailable = !!process.env.GEMINI_API_KEY;
    this.anthropicAvailable = !!process.env.ANTHROPIC_API_KEY;
    this.groqAvailable = !!process.env.GROQ_API_KEY;

    console.log('[FallbackLLMProvider] Available providers:', {
      gemini: this.geminiAvailable,
      anthropic: this.anthropicAvailable,
      groq: this.groqAvailable,
    });
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const result = await this.completeWithMetadata(options);
    return result.content;
  }

  async completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const errors: string[] = [];

    // Try Gemini first (fastest for AI Teacher)
    if (this.geminiAvailable) {
      try {
        const result = await this.geminiProvider.completeWithMetadata(options);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[FallbackLLMProvider] Gemini failed:', errorMsg);
        errors.push(`Gemini: ${errorMsg}`);

        // Check if it's a rate limit or auth error
        if (errorMsg.includes('429') || errorMsg.includes('quota')) {
          console.warn('[FallbackLLMProvider] Gemini rate limited, trying next provider');
        }
      }
    }

    // Try Claude (high quality fallback)
    if (this.anthropicAvailable) {
      try {
        const result = await this.anthropicProvider.completeWithMetadata(options);
        console.log('[FallbackLLMProvider] Successfully used Claude as fallback');
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[FallbackLLMProvider] Claude failed:', errorMsg);
        errors.push(`Claude: ${errorMsg}`);
      }
    }

    // Try Groq (free backup)
    if (this.groqAvailable) {
      try {
        const result = await this.groqProvider.completeWithMetadata(options);
        console.log('[FallbackLLMProvider] Successfully used Groq as fallback');
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[FallbackLLMProvider] Groq failed:', errorMsg);
        errors.push(`Groq: ${errorMsg}`);
      }
    }

    // All providers failed
    throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
  }

  /**
   * Stream completion with fallback
   * Note: Only Gemini supports streaming, others fall back to regular completion
   */
  async *streamComplete(options: LLMCompletionOptions): AsyncGenerator<string, void, unknown> {
    // Try Gemini streaming first
    if (this.geminiAvailable) {
      try {
        for await (const chunk of this.geminiProvider.streamComplete(options)) {
          yield chunk;
        }
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[FallbackLLMProvider] Gemini streaming failed:', errorMsg);
      }
    }

    // Fallback to non-streaming providers
    try {
      const result = await this.completeWithMetadata(options);
      // Simulate streaming by yielding the full response
      yield result.content;
    } catch (error) {
      throw error;
    }
  }
}
