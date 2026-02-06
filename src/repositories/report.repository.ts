import { injectable, inject } from 'tsyringe';
import { PrismaClient, InteractionReport } from '@prisma/client';
import { IReportRepository, CreateReportData } from './interfaces/report.repository.interface';

@injectable()
export class ReportRepository implements IReportRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async findById(id: string): Promise<InteractionReport | null> {
    return this.prisma.interactionReport.findUnique({
      where: { id },
    });
  }

  async findBySourceId(sourceId: string): Promise<InteractionReport | null> {
    return this.prisma.interactionReport.findUnique({
      where: { sourceId },
    });
  }

  async findByTrainee(traineeId: string, limit?: number): Promise<InteractionReport[]> {
    return this.prisma.interactionReport.findMany({
      where: { traineeId },
      orderBy: { generatedAt: 'desc' },
      take: limit,
    });
  }

  async findByType(traineeId: string, reportType: string): Promise<InteractionReport[]> {
    return this.prisma.interactionReport.findMany({
      where: { traineeId, reportType },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async create(data: CreateReportData): Promise<InteractionReport> {
    // Use upsert to handle unique constraint on sourceId
    // If a report already exists for this session, update it instead of failing
    return this.prisma.interactionReport.upsert({
      where: {
        sourceId: data.sourceId,
      },
      update: {
        summary: JSON.stringify(data.summary),
        strengths: JSON.stringify(data.strengths || []),
        weaknesses: JSON.stringify(data.weaknesses || []),
        knowledgeGaps: JSON.stringify(data.knowledgeGaps || []),
        recommendations: JSON.stringify(data.recommendations || []),
        suggestedNextSteps: JSON.stringify(data.suggestedNextSteps || []),
        progressSummary: data.progressSummary ? JSON.stringify(data.progressSummary) : null,
        generatedAt: new Date(),
      },
      create: {
        traineeId: data.traineeId,
        reportType: data.reportType,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        summary: JSON.stringify(data.summary),
        strengths: JSON.stringify(data.strengths || []),
        weaknesses: JSON.stringify(data.weaknesses || []),
        knowledgeGaps: JSON.stringify(data.knowledgeGaps || []),
        recommendations: JSON.stringify(data.recommendations || []),
        suggestedNextSteps: JSON.stringify(data.suggestedNextSteps || []),
        progressSummary: data.progressSummary ? JSON.stringify(data.progressSummary) : null,
      },
    });
  }

  async update(id: string, data: Partial<CreateReportData>): Promise<InteractionReport> {
    const updateData: Record<string, unknown> = {};

    if (data.summary !== undefined) updateData.summary = JSON.stringify(data.summary);
    if (data.strengths !== undefined) updateData.strengths = JSON.stringify(data.strengths);
    if (data.weaknesses !== undefined) updateData.weaknesses = JSON.stringify(data.weaknesses);
    if (data.knowledgeGaps !== undefined) updateData.knowledgeGaps = JSON.stringify(data.knowledgeGaps);
    if (data.recommendations !== undefined) updateData.recommendations = JSON.stringify(data.recommendations);
    if (data.suggestedNextSteps !== undefined) updateData.suggestedNextSteps = JSON.stringify(data.suggestedNextSteps);
    if (data.progressSummary !== undefined) updateData.progressSummary = data.progressSummary ? JSON.stringify(data.progressSummary) : null;

    return this.prisma.interactionReport.update({
      where: { id },
      data: updateData,
    });
  }

  async getTraineeReportSummary(traineeId: string): Promise<{
    totalReports: number;
    averageScore: number;
    recentTrend: 'improving' | 'stable' | 'declining';
  }> {
    const reports = await this.prisma.interactionReport.findMany({
      where: { traineeId },
      orderBy: { generatedAt: 'desc' },
      take: 10,
      select: { summary: true, generatedAt: true },
    });

    const scores = reports
      .map(r => {
        try {
          const summary = typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary;
          return (summary?.overallScore as number) || 0;
        } catch {
          return 0;
        }
      })
      .filter(score => score > 0);

    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (scores.length >= 3) {
      const recentAvg = (scores[0] + scores[1] + scores[2]) / 3;
      const olderAvg = scores.slice(3).reduce((a, b) => a + b, 0) / (scores.length - 3) || recentAvg;

      if (recentAvg - olderAvg > 5) recentTrend = 'improving';
      else if (olderAvg - recentAvg > 5) recentTrend = 'declining';
    }

    return {
      totalReports: reports.length,
      averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      recentTrend,
    };
  }
}
