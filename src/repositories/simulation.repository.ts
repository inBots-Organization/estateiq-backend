import { injectable, inject } from 'tsyringe';
import { PrismaClient, SimulationSession, ConversationTurn } from '@prisma/client';
import {
  ISimulationRepository,
  CreateSimulationData,
  UpdateSimulationData,
  CreateConversationTurnData,
} from './interfaces/simulation.repository.interface';

@injectable()
export class SimulationRepository implements ISimulationRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async findById(id: string): Promise<SimulationSession | null> {
    return this.prisma.simulationSession.findUnique({
      where: { id },
    });
  }

  async findByIdWithTurns(id: string): Promise<(SimulationSession & { conversationTurns: ConversationTurn[] }) | null> {
    return this.prisma.simulationSession.findUnique({
      where: { id },
      include: {
        conversationTurns: {
          orderBy: { turnNumber: 'asc' },
        },
      },
    });
  }

  async findByTrainee(traineeId: string, limit?: number): Promise<SimulationSession[]> {
    return this.prisma.simulationSession.findMany({
      where: { traineeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async create(data: CreateSimulationData): Promise<SimulationSession> {
    return this.prisma.simulationSession.create({
      data: {
        traineeId: data.traineeId,
        scenarioType: data.scenarioType as string,
        difficultyLevel: data.difficultyLevel as string,
        clientPersona: JSON.stringify(data.clientPersona),
        recordingUrl: data.recordingUrl,
        status: 'scheduled',
      },
    });
  }

  async update(id: string, data: UpdateSimulationData): Promise<SimulationSession> {
    const updateData: Record<string, unknown> = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.startedAt !== undefined) updateData.startedAt = data.startedAt;
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;
    if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
    if (data.outcome !== undefined) updateData.outcome = data.outcome;
    if (data.recordingUrl !== undefined) updateData.recordingUrl = data.recordingUrl;
    if (data.metrics !== undefined) updateData.metrics = JSON.stringify(data.metrics);

    return this.prisma.simulationSession.update({
      where: { id },
      data: updateData,
    });
  }

  async addConversationTurn(data: CreateConversationTurnData): Promise<ConversationTurn> {
    return this.prisma.conversationTurn.create({
      data: {
        sessionId: data.sessionId,
        speaker: data.speaker,
        message: data.message,
        sentiment: data.sentiment ?? null,
        detectedIntent: data.detectedIntent ?? null,
        turnNumber: data.turnNumber,
      },
    });
  }

  async getConversationTurns(sessionId: string): Promise<ConversationTurn[]> {
    return this.prisma.conversationTurn.findMany({
      where: { sessionId },
      orderBy: { turnNumber: 'asc' },
    });
  }

  async getTurnCount(sessionId: string): Promise<number> {
    return this.prisma.conversationTurn.count({
      where: { sessionId },
    });
  }

  async getTraineeSimulationStats(traineeId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    averageScore: number;
    scenarioBreakdown: Record<string, number>;
  }> {
    const sessions = await this.prisma.simulationSession.findMany({
      where: { traineeId },
      select: {
        status: true,
        scenarioType: true,
        metrics: true,
      },
    });

    const completedSessions = sessions.filter(s => s.status === 'completed');
    const scores = completedSessions
      .map(s => {
        try {
          const metrics = typeof s.metrics === 'string' ? JSON.parse(s.metrics) : s.metrics;
          return (metrics?.overallScore as number) || 0;
        } catch {
          return 0;
        }
      })
      .filter(score => score > 0);

    const scenarioBreakdown = sessions.reduce((acc, session) => {
      acc[session.scenarioType] = (acc[session.scenarioType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      scenarioBreakdown,
    };
  }
}
