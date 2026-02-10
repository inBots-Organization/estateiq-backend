import { injectable, inject } from 'tsyringe';
import { PrismaClient, DiagnosticSession, DailySkillReport } from '@prisma/client';
import {
  IDiagnosticRepository,
  CreateDiagnosticSessionData,
  UpdateDiagnosticSessionData,
  UpsertDailyReportData,
} from './interfaces/diagnostic.repository.interface';

@injectable()
export class DiagnosticRepository implements IDiagnosticRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  // ─── DiagnosticSession ────────────────────────────────────

  async createSession(data: CreateDiagnosticSessionData): Promise<DiagnosticSession> {
    return this.prisma.diagnosticSession.create({
      data: {
        traineeId: data.traineeId,
        triggeredBy: data.triggeredBy,
        simulationSessionId: data.simulationSessionId,
        quizAttemptId: data.quizAttemptId,
        status: 'pending',
      },
    });
  }

  async updateSession(id: string, data: UpdateDiagnosticSessionData): Promise<DiagnosticSession> {
    const updateData: Record<string, unknown> = {};
    if (data.simulationSessionId !== undefined) updateData.simulationSessionId = data.simulationSessionId;
    if (data.quizAttemptId !== undefined) updateData.quizAttemptId = data.quizAttemptId;
    if (data.overallLevel !== undefined) updateData.overallLevel = data.overallLevel;
    if (data.overallScore !== undefined) updateData.overallScore = data.overallScore;
    if (data.skillScores !== undefined) updateData.skillScores = data.skillScores;
    if (data.strengths !== undefined) updateData.strengths = data.strengths;
    if (data.weaknesses !== undefined) updateData.weaknesses = data.weaknesses;
    if (data.knowledgeGaps !== undefined) updateData.knowledgeGaps = data.knowledgeGaps;
    if (data.aiNotes !== undefined) updateData.aiNotes = data.aiNotes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;

    return this.prisma.diagnosticSession.update({
      where: { id },
      data: updateData,
    });
  }

  async getSessionById(id: string): Promise<DiagnosticSession | null> {
    return this.prisma.diagnosticSession.findUnique({
      where: { id },
    });
  }

  async getLatestSession(traineeId: string): Promise<DiagnosticSession | null> {
    return this.prisma.diagnosticSession.findFirst({
      where: { traineeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSessionsByTrainee(traineeId: string, limit = 10): Promise<DiagnosticSession[]> {
    return this.prisma.diagnosticSession.findMany({
      where: { traineeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── DailySkillReport ────────────────────────────────────

  async upsertDailyReport(data: UpsertDailyReportData): Promise<DailySkillReport> {
    return this.prisma.dailySkillReport.upsert({
      where: {
        traineeId_date: {
          traineeId: data.traineeId,
          date: data.date,
        },
      },
      create: {
        traineeId: data.traineeId,
        date: data.date,
        level: data.level,
        overallScore: data.overallScore,
        skillScores: data.skillScores,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        knowledgeGaps: data.knowledgeGaps,
        diagnosticSessionId: data.diagnosticSessionId,
        dataSourceIds: data.dataSourceIds,
        recommendedCourseIds: data.recommendedCourseIds,
        recommendedTopics: data.recommendedTopics,
      },
      update: {
        level: data.level,
        overallScore: data.overallScore,
        skillScores: data.skillScores,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        knowledgeGaps: data.knowledgeGaps,
        diagnosticSessionId: data.diagnosticSessionId,
        dataSourceIds: data.dataSourceIds,
        recommendedCourseIds: data.recommendedCourseIds,
        recommendedTopics: data.recommendedTopics,
      },
    });
  }

  async getLatestReport(traineeId: string): Promise<DailySkillReport | null> {
    return this.prisma.dailySkillReport.findFirst({
      where: { traineeId },
      orderBy: { date: 'desc' },
    });
  }

  async getReportByDate(traineeId: string, date: Date): Promise<DailySkillReport | null> {
    return this.prisma.dailySkillReport.findUnique({
      where: {
        traineeId_date: {
          traineeId,
          date,
        },
      },
    });
  }

  async getReportHistory(traineeId: string, days: number): Promise<DailySkillReport[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.dailySkillReport.findMany({
      where: {
        traineeId,
        date: { gte: since },
      },
      orderBy: { date: 'desc' },
    });
  }

  // ─── Trainee updates ────────────────────────────────────

  async updateTraineeDiagnosticFields(traineeId: string, data: {
    lastDiagnosticAt?: Date;
    currentSkillLevel?: string;
  }): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.lastDiagnosticAt !== undefined) updateData.lastDiagnosticAt = data.lastDiagnosticAt;
    if (data.currentSkillLevel !== undefined) updateData.currentSkillLevel = data.currentSkillLevel;

    await this.prisma.trainee.update({
      where: { id: traineeId },
      data: updateData,
    });
  }
}
