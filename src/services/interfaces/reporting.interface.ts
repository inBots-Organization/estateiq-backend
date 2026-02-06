export interface SessionReport {
  id: string;
  traineeId: string;
  sessionId: string;
  overallScore: number;
  percentileRank: number | null;
  trend: 'improving' | 'stable' | 'declining';
  timeSpentMinutes: number;
  strengths: SkillAssessment[];
  weaknesses: SkillAssessment[];
  knowledgeGaps: KnowledgeGap[];
  recommendations: Recommendation[];
}

export interface LevelReport {
  id: string;
  traineeId: string;
  levelId: string;
  overallScore: number;
  lecturesCompleted: number;
  lecturesTotal: number;
  assessmentsPassed: number;
  assessmentsTotal: number;
  simulationsCompleted: number;
  competencyTrends: CompetencyTrend[];
  recommendations: Recommendation[];
}

export interface ProgramReport {
  id: string;
  traineeId: string;
  programId: string;
  overallScore: number;
  completionDate: Date;
  totalTimeSpent: number;
  levelsCompleted: number;
  finalAssessment: {
    strengths: string[];
    areasForGrowth: string[];
    certificationReady: boolean;
  };
}

export interface SkillAssessment {
  skillName: string;
  category: 'knowledge' | 'communication' | 'negotiation' | 'soft_skill';
  score: number;
  evidence: string[];
  benchmarkComparison: 'above' | 'at' | 'below';
}

export interface KnowledgeGap {
  topic: string;
  severity: 'critical' | 'moderate' | 'minor';
  description: string;
  relatedLectureIds: string[];
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: 'review_content' | 'practice_skill' | 'seek_support' | 'advance';
  title: string;
  description: string;
  actionableSteps: string[];
}

export interface CompetencyTrend {
  competencyName: string;
  scores: { date: Date; score: number }[];
  trend: 'improving' | 'stable' | 'declining';
}

export interface IReportingService {
  generateSessionReport(sessionId: string, traineeId: string): Promise<SessionReport>;
  generateLevelReport(levelId: string, traineeId: string): Promise<LevelReport>;
  generateProgramReport(programId: string, traineeId: string): Promise<ProgramReport>;
  getTraineeReports(traineeId: string): Promise<SessionReport[]>;
  getOrganizationAnalytics(organizationId: string): Promise<any>;
}
