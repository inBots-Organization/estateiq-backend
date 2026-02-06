/**
 * ElevenLabs Conversational AI Service Interface
 *
 * Handles agent management, conversation sessions, and performance analysis
 * for real-time voice sales training calls.
 */

export interface IElevenLabsService {
  /**
   * Get or create the Saudi real estate client agent
   */
  getAgentId(): Promise<string>;

  /**
   * Get a signed URL for secure WebSocket connection
   */
  getSignedUrl(agentId: string): Promise<string>;

  /**
   * Get conversation details including transcript
   */
  getConversation(conversationId: string): Promise<ConversationDetails>;

  /**
   * Get conversation audio recording
   */
  getConversationAudio(conversationId: string): Promise<Buffer>;

  /**
   * Analyze trainee performance from conversation
   */
  analyzePerformance(conversationId: string): Promise<PerformanceAnalysis>;

  /**
   * Save conversation and analysis to database
   */
  saveConversationRecord(
    traineeId: string,
    conversationId: string,
    analysis: PerformanceAnalysis
  ): Promise<string>;

  /**
   * Get trainee's conversation history
   */
  getTraineeConversations(traineeId: string): Promise<ConversationSummary[]>;
}

// ============================================================================
// TYPES
// ============================================================================

export interface TranscriptMessage {
  role: 'user' | 'agent';
  message: string;
  timeInCallSecs: number;
}

export interface ConversationDetails {
  conversationId: string;
  agentId: string;
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
  transcript: TranscriptMessage[];
  metadata: {
    startTime: number;
    duration: number;
    cost?: number;
  };
  hasAudio: boolean;
}

export interface PerformanceAnalysis {
  overallScore: number;
  breakdown: {
    opening: number;
    needsDiscovery: number;
    objectionHandling: number;
    persuasion: number;
    closing: number;
    communication: number;
  };
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  summary: string;
  transcriptHighlights: {
    good: string[];
    needsWork: string[];
  };
}

export interface ConversationSummary {
  id: string;
  conversationId: string;
  traineeId: string;
  startTime: Date;
  duration: number;
  overallScore: number;
  status: string;
}

export interface AgentConfig {
  name: string;
  firstMessage: string;
  systemPrompt: string;
  voiceId: string;
  language: string;
}
