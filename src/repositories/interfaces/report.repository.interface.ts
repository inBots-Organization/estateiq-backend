import { InteractionReport } from '@prisma/client';
import { ReportType, ReportSourceType } from '../../types/enums';

export interface CreateReportData {
  traineeId: string;
  reportType: ReportType;
  sourceType: ReportSourceType;
  sourceId: string;
  summary: Record<string, unknown>;
  strengths?: unknown[];
  weaknesses?: unknown[];
  knowledgeGaps?: unknown[];
  recommendations?: unknown[];
  suggestedNextSteps?: string[];
  progressSummary?: Record<string, unknown>;
}

export interface IReportRepository {
  findById(id: string): Promise<InteractionReport | null>;
  findBySourceId(sourceId: string): Promise<InteractionReport | null>;
  findByTrainee(traineeId: string, limit?: number): Promise<InteractionReport[]>;
  findByType(traineeId: string, reportType: ReportType): Promise<InteractionReport[]>;
  create(data: CreateReportData): Promise<InteractionReport>;
  update(id: string, data: Partial<CreateReportData>): Promise<InteractionReport>;
  getTraineeReportSummary(traineeId: string): Promise<{
    totalReports: number;
    averageScore: number;
    recentTrend: 'improving' | 'stable' | 'declining';
  }>;
}
