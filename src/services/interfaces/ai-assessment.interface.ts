import { ConversationTurn, ClientPersona } from './objection-handling.interface';

export interface AssessmentInput {
  traineeId: string;
  lectureId: string;
  responses: {
    questionId: string;
    answer: string;
  }[];
}

export interface AssessmentResult {
  score: number;
  passed: boolean;
  feedback: string;
  strengths: string[];
  areasForImprovement: string[];
  recommendedReview: string[];
}

export interface ConversationAssessment {
  overallScore: number;
  communicationScore: number;
  technicalKnowledgeScore: number;
  problemSolvingScore: number;
  feedback: string;
  keyInsights: string[];
}

export interface IAIAssessmentService {
  assessLectureCompletion(input: AssessmentInput): Promise<AssessmentResult>;
  assessConversation(
    conversationHistory: ConversationTurn[],
    persona: ClientPersona,
    scenarioType: string
  ): Promise<ConversationAssessment>;
  generateFeedback(score: number, context: string): Promise<string>;
}
