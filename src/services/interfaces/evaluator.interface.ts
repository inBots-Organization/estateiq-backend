import { SkillScores, SkillLevel } from './diagnostic.interface';

// ─── AI Teacher Names ────────────────────────────────────

export type AITeacherName = 'ahmed' | 'noura' | 'anas' | 'abdullah';

// ─── Teacher Assignment ──────────────────────────────────

export interface TeacherAssignment {
  teacherName: AITeacherName;
  teacherDisplayName: { ar: string; en: string };
  teacherDescription: { ar: string; en: string };
  assignmentReason: { ar: string; en: string };
}

// ─── Skill Analysis ──────────────────────────────────────

export type SkillProficiencyLevel = 'weak' | 'developing' | 'competent' | 'strong' | 'excellent';

export interface SkillAnalysis {
  skillName: string;
  score: number;
  level: SkillProficiencyLevel;
  analysis: { ar: string; en: string };
  improvementTips: Array<{ ar: string; en: string }>;
}

// ─── Improvement Plan ────────────────────────────────────

export interface ImprovementPlanItem {
  ar: string;
  en: string;
}

export interface ImprovementPlan {
  shortTerm: ImprovementPlanItem[];
  mediumTerm: ImprovementPlanItem[];
  longTerm: ImprovementPlanItem[];
}

// ─── Evaluator Report ────────────────────────────────────

export interface EvaluatorReport {
  skillAnalyses: SkillAnalysis[];
  overallNarrative: { ar: string; en: string };
  improvementPlan: ImprovementPlan;
  teacherAssignment: TeacherAssignment;
  generatedAt: string;
  modelUsed: string;
  brainContextUsed: boolean;
}

// ─── Evaluator Input ─────────────────────────────────────

export interface EvaluatorInput {
  traineeId: string;
  organizationId: string;
  diagnosticSessionId: string;
  dailySkillReportId: string;
  skillScores: SkillScores;
  overallScore: number;
  level: SkillLevel;
  strengths: string[];
  weaknesses: string[];
  knowledgeGaps: string[];
}

// ─── Service Interface ───────────────────────────────────

export interface IEvaluatorService {
  evaluate(input: EvaluatorInput): Promise<EvaluatorReport>;
  getTeacherForScore(score: number): TeacherAssignment;
}
