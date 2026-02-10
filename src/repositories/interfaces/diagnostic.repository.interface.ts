import { DiagnosticSession, DailySkillReport } from '@prisma/client';

export interface CreateDiagnosticSessionData {
  traineeId: string;
  triggeredBy: 'system' | 'manual';
  simulationSessionId?: string;
  quizAttemptId?: string;
}

export interface UpdateDiagnosticSessionData {
  simulationSessionId?: string;
  quizAttemptId?: string;
  overallLevel?: string;
  overallScore?: number;
  skillScores?: string;
  strengths?: string[];
  weaknesses?: string[];
  knowledgeGaps?: string[];
  aiNotes?: string;
  status?: string;
  completedAt?: Date;
}

export interface UpsertDailyReportData {
  traineeId: string;
  date: Date;
  level: string;
  overallScore: number;
  skillScores: string;
  strengths: string[];
  weaknesses: string[];
  knowledgeGaps: string[];
  diagnosticSessionId?: string;
  dataSourceIds?: string;
  recommendedCourseIds: string[];
  recommendedTopics: string[];
}

export interface IDiagnosticRepository {
  // DiagnosticSession
  createSession(data: CreateDiagnosticSessionData): Promise<DiagnosticSession>;
  updateSession(id: string, data: UpdateDiagnosticSessionData): Promise<DiagnosticSession>;
  getSessionById(id: string): Promise<DiagnosticSession | null>;
  getLatestSession(traineeId: string): Promise<DiagnosticSession | null>;
  getSessionsByTrainee(traineeId: string, limit?: number): Promise<DiagnosticSession[]>;

  // DailySkillReport
  upsertDailyReport(data: UpsertDailyReportData): Promise<DailySkillReport>;
  getLatestReport(traineeId: string): Promise<DailySkillReport | null>;
  getReportByDate(traineeId: string, date: Date): Promise<DailySkillReport | null>;
  getReportHistory(traineeId: string, days: number): Promise<DailySkillReport[]>;

  // Trainee field updates
  updateTraineeDiagnosticFields(traineeId: string, data: {
    lastDiagnosticAt?: Date;
    currentSkillLevel?: string;
  }): Promise<void>;

  // Trainee helpers
  getTraineeOrganizationId(traineeId: string): Promise<string | null>;
}
