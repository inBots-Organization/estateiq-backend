import { injectable } from 'tsyringe';
import Anthropic from '@anthropic-ai/sdk';
import { ILLMProvider, LLMCompletionOptions, LLMCompletionResult } from './llm-provider.interface';

@injectable()
export class AnthropicLLMProvider implements ILLMProvider {
  private client: Anthropic | null = null;

  /**
   * Get or create the Anthropic client (lazy initialization)
   * This ensures the API key is read at call time, not constructor time
   */
  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }

      this.client = new Anthropic({
        apiKey: apiKey,
      });
    }
    return this.client;
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const result = await this.completeWithMetadata(options);
    return result.content;
  }

  async completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { prompt, systemPrompt, maxTokens = 1024, temperature = 0.7 } = options;

    const client = this.getClient();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514', // High quality model for better roleplay
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt || 'You are a helpful AI assistant for a real estate training simulation.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic API');
    }

    return {
      content: content.text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
