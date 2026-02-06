import { SimulationSession, ConversationTurn } from '@prisma/client';
import {
  SimulationScenarioType,
  DifficultyLevel,
  SimulationStatus,
  SimulationOutcome,
  Sentiment,
} from '../../types/enums';

export interface CreateSimulationData {
  traineeId: string;
  scenarioType: SimulationScenarioType;
  difficultyLevel: DifficultyLevel;
  clientPersona: Record<string, unknown>;
  recordingUrl?: string;
}

export interface UpdateSimulationData {
  status?: SimulationStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationSeconds?: number;
  metrics?: Record<string, unknown>;
  outcome?: SimulationOutcome;
  recordingUrl?: string;
}

export interface CreateConversationTurnData {
  sessionId: string;
  speaker: 'trainee' | 'client';
  message: string;
  sentiment?: Sentiment;
  detectedIntent?: string;
  turnNumber: number;
}

export interface ISimulationRepository {
  findById(id: string): Promise<SimulationSession | null>;
  findByIdWithTurns(id: string): Promise<(SimulationSession & { conversationTurns: ConversationTurn[] }) | null>;
  findByTrainee(traineeId: string, limit?: number): Promise<SimulationSession[]>;
  create(data: CreateSimulationData): Promise<SimulationSession>;
  update(id: string, data: UpdateSimulationData): Promise<SimulationSession>;
  addConversationTurn(data: CreateConversationTurnData): Promise<ConversationTurn>;
  getConversationTurns(sessionId: string): Promise<ConversationTurn[]>;
  getTurnCount(sessionId: string): Promise<number>;
  getTraineeSimulationStats(traineeId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageScore: number;
    scenarioBreakdown: Record<SimulationScenarioType, number>;
  }>;
}
