export interface LLMCompletionOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
}

export interface LLMCompletionResult {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ILLMProvider {
  complete(options: LLMCompletionOptions): Promise<string>;
  completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult>;
}
