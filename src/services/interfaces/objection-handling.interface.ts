import { SimulationScenarioType, DifficultyLevel, Sentiment } from '../../types/enums';

export type ConversationState = 'opening' | 'discovery' | 'presenting' | 'negotiating' | 'closing' | 'ended';

export interface ClientPersona {
  name: string;
  background: string;
  personality: 'friendly' | 'skeptical' | 'demanding' | 'indecisive' | 'analytical';
  budget: string;
  motivations: string[];
  objections: string[];
  hiddenConcerns: string[];
}

export interface ConversationTurn {
  speaker: 'trainee' | 'client';
  message: string;
  timestamp: Date;
  sentiment: Sentiment | null;
  detectedIntent: string | null;
}

export type ObjectionCategory =
  | 'price_budget'
  | 'timing_urgency'
  | 'competition_alternatives'
  | 'trust_credibility'
  | 'feature_quality'
  | 'location_area'
  | 'process_complexity';

export interface GeneratedObjection {
  id: string;
  category: ObjectionCategory;
  severity: 'soft' | 'moderate' | 'strong';
  coreContent: string;
  variations: string[];
  triggerConditions: string[];
  idealResponses: string[];
  commonMistakes: string[];
}

export interface ObjectionGenerationContext {
  scenarioType: SimulationScenarioType;
  difficultyLevel: DifficultyLevel;
  persona: ClientPersona;
  conversationHistory: ConversationTurn[];
}

export interface ConversationContext {
  currentTurn: number;
  conversationState: ConversationState;
  lastTraineeMessage: string;
  pendingObjections: GeneratedObjection[];
  raisedObjections: RaisedObjection[];
  overallSentiment: Sentiment;
  difficultyLevel: DifficultyLevel;
}

export interface ObjectionDecision {
  shouldInject: boolean;
  objection?: GeneratedObjection;
  reason: string;
  timing: 'immediate' | 'next_turn' | 'delayed';
}

export interface RaisedObjection {
  objection: GeneratedObjection;
  raisedAtTurn: number;
  traineeResponse: string | null;
  evaluation: ObjectionHandlingEvaluation | null;
  resolved: boolean;
}

export type ObjectionTechnique =
  | 'feel_felt_found'
  | 'acknowledge_and_pivot'
  | 'question_to_understand'
  | 'reframe_value'
  | 'social_proof'
  | 'future_pacing'
  | 'isolation'
  | 'trial_close';

export interface ObjectionHandlingEvaluation {
  score: number;
  acknowledged: boolean;
  empathyShown: boolean;
  addressedDirectly: boolean;
  providedValue: boolean;
  askedFollowUp: boolean;
  techniques: ObjectionTechnique[];
  feedback: string;
  improvements: string[];
}

export interface ClientReaction {
  newSentiment: Sentiment;
  objectionResolved: boolean;
  nextAction: 'accept' | 'soften' | 'maintain' | 'escalate';
  responseGuidance: string;
}

export interface IObjectionHandlingService {
  generateObjections(context: ObjectionGenerationContext): Promise<GeneratedObjection[]>;
  shouldInjectObjection(context: ConversationContext): Promise<ObjectionDecision>;
  formulateObjection(
    objection: GeneratedObjection,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[]
  ): Promise<string>;
  evaluateObjectionHandling(
    objection: GeneratedObjection,
    traineeResponse: string,
    conversationContext: ConversationTurn[]
  ): Promise<ObjectionHandlingEvaluation>;
  determineClientReaction(
    evaluation: ObjectionHandlingEvaluation,
    persona: ClientPersona
  ): Promise<ClientReaction>;
}
