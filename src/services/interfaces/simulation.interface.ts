import { SimulationScenarioType, DifficultyLevel, SimulationOutcome } from '../../types/enums';
import { ClientPersona, ConversationState } from './objection-handling.interface';

// Input DTOs
export interface StartSimulationInput {
  traineeId: string;
  scenarioType: SimulationScenarioType;
  difficultyLevel: DifficultyLevel;
  customPersonaConfig?: Partial<ClientPersona>;
  recordSession: boolean;
}

export interface SimulationMessageInput {
  sessionId: string;
  traineeId: string;
  message: string;
  messageType: 'text' | 'voice_transcript';
  timestamp: Date;
}

export interface EndSimulationInput {
  sessionId: string;
  traineeId: string;
  endReason: 'completed' | 'abandoned' | 'timeout' | 'error';
}

export interface AnalyzeSimulationInput {
  sessionId: string;
  includeDetailedTranscriptAnalysis: boolean;
  compareToHistory: boolean;
  generateRecommendations: boolean;
}

// Output DTOs
export interface StartSimulationOutput {
  sessionId: string;
  status: 'ready' | 'initializing';
  clientPersona: ClientPersona;
  scenarioContext: string;
  initialClientMessage: string;
  estimatedDurationMinutes: number;
  tips: string[];
}

export interface SimulationMessageOutput {
  sessionId: string;
  clientResponse: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  conversationState: ConversationState;
  hints: string[];
  turnNumber: number;
  elapsedTimeSeconds: number;
}

export interface EndSimulationOutput {
  sessionId: string;
  status: 'completed' | 'abandoned';
  totalDurationSeconds: number;
  turnCount: number;
  preliminaryScore: number;
  outcome: SimulationOutcome;
  nextSteps: string[];
}

export interface SkillScoreDetail {
  score: number;
  benchmark: number;
  trend: 'improving' | 'stable' | 'declining';
  evidence: string[];
  tips: string[];
}

export interface KeyMoment {
  timestamp: Date;
  type: 'strength' | 'improvement_area' | 'missed_opportunity';
  description: string;
  recommendation: string | null;
}

export interface SimulationAnalysisOutput {
  sessionId: string;
  traineeId: string;
  generatedAt: Date;
  overallPerformance: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    summary: string;
  };
  skillScores: {
    communication: SkillScoreDetail;
    negotiation: SkillScoreDetail;
    objectionHandling: SkillScoreDetail;
    relationshipBuilding: SkillScoreDetail;
    productKnowledge: SkillScoreDetail;
    closingTechnique: SkillScoreDetail;
  };
  conversationAnalysis: {
    talkTimeRatio: number;
    averageResponseTime: number;
    questionAsked: number;
    activeListeningIndicators: number;
    empathyStatements: number;
  };
  highlights: KeyMoment[];
  improvementAreas: KeyMoment[];
  missedOpportunities: KeyMoment[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    category: 'review_content' | 'practice_skill' | 'seek_support' | 'advance';
    title: string;
    description: string;
    actionableSteps: string[];
  }[];
  suggestedPracticeScenarios: SimulationScenarioType[];
  historicalComparison?: {
    previousAverageScore: number;
    improvement: number;
    consistentStrengths: string[];
    persistentWeaknesses: string[];
  };
}

export interface ISimulationService {
  startSimulation(input: StartSimulationInput): Promise<StartSimulationOutput>;
  processMessage(input: SimulationMessageInput): Promise<SimulationMessageOutput>;
  endSimulation(input: EndSimulationInput): Promise<EndSimulationOutput>;
  analyzeSimulation(input: AnalyzeSimulationInput): Promise<SimulationAnalysisOutput>;
  getSessionById(sessionId: string): Promise<any>;
}
