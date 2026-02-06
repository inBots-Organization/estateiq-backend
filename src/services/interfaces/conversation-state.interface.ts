import { Sentiment } from '../../types/enums';
import { ConversationState, ConversationTurn, ClientPersona } from './objection-handling.interface';

export interface ConversationAnalysis {
  currentState: ConversationState;
  sentiment: Sentiment;
  detectedIntent: string | null;
  suggestedHints: string[];
}

export interface IConversationStateService {
  analyzeMessage(
    message: string,
    conversationHistory: ConversationTurn[],
    persona: ClientPersona
  ): Promise<ConversationAnalysis>;

  determineNextState(
    currentState: ConversationState,
    analysis: ConversationAnalysis,
    turnNumber: number
  ): ConversationState;

  generateClientResponse(
    traineeMessage: string,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[],
    state: ConversationState,
    injectedObjection?: string
  ): Promise<string>;
}
