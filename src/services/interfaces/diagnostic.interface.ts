export const CORE_SKILLS = [
  'communication',
  'negotiation',
  'objectionHandling',
  'relationshipBuilding',
  'productKnowledge',
  'closingTechnique',
] as const;

export type CoreSkill = typeof CORE_SKILLS[number];
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface SkillScores {
  communication: number;
  negotiation: number;
  objectionHandling: number;
  relationshipBuilding: number;
  productKnowledge: number;
  closingTechnique: number;
}

// ─── Check Status ──────────────────────────────────────────

export interface DiagnosticStatusOutput {
  needsDiagnostic: boolean;
  lastDiagnosticAt: Date | null;
  hoursSinceLast: number | null;
  currentReport: {
    level: SkillLevel;
    overallScore: number;
    skillScores: SkillScores;
    strengths: string[];
    weaknesses: string[];
    knowledgeGaps: string[];
    date: Date;
  } | null;
}

// ─── Trigger Diagnostic ────────────────────────────────────

export interface TriggerDiagnosticInput {
  traineeId: string;
  triggeredBy: 'system' | 'manual';
}

export interface TriggerDiagnosticOutput {
  diagnosticSessionId: string;
  status: 'started' | 'skipped_recent';
  lastDiagnosticAt?: Date;
}

// ─── Complete Diagnostic ───────────────────────────────────

export interface CompleteDiagnosticInput {
  diagnosticSessionId: string;
  traineeId: string;
  simulationSessionId?: string;
  quizAttemptId?: string;
}

export interface CompleteDiagnosticOutput {
  report: {
    level: SkillLevel;
    overallScore: number;
    skillScores: SkillScores;
    strengths: string[];
    weaknesses: string[];
    knowledgeGaps: string[];
    recommendedCourseIds: string[];
    recommendedTopics: string[];
  };
  improvement: number;
}

// ─── Service Interface ─────────────────────────────────────

export interface IDiagnosticService {
  checkStatus(traineeId: string): Promise<DiagnosticStatusOutput>;
  triggerDiagnostic(input: TriggerDiagnosticInput): Promise<TriggerDiagnosticOutput>;
  completeDiagnostic(input: CompleteDiagnosticInput): Promise<CompleteDiagnosticOutput>;
  buildReportFromHistory(traineeId: string): Promise<CompleteDiagnosticOutput>;
}
