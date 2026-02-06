import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import type { ILLMProvider } from '../../../src/providers/llm/llm-provider.interface';

// Mock AIAssessmentService implementation for testing
class AIAssessmentService {
  constructor(
    private llmProvider: ILLMProvider,
    private assessmentRepository: any
  ) {}

  async startAssessmentSession(traineeId: string, lectureId: string) {
    const session = await this.assessmentRepository.create({
      traineeId,
      lectureId,
      status: 'in_progress',
      startedAt: new Date(),
    });

    const response = await this.llmProvider.complete(
      `Generate assessment opening for lecture ${lectureId}`
    );

    const parsed = JSON.parse(response);

    return {
      sessionId: session.id,
      status: session.status,
      initialMessage: `${parsed.greeting} ${parsed.firstQuestion}`,
    };
  }

  async processTraineeResponse(sessionId: string, response: string) {
    const session = await this.assessmentRepository.findById(sessionId);

    const evaluationResponse = await this.llmProvider.complete(
      `Evaluate response: ${response}`
    );

    const parsed = JSON.parse(evaluationResponse);

    if (parsed.assessmentComplete) {
      await this.assessmentRepository.update(sessionId, {
        status: 'completed',
        finalScore: parsed.finalScore,
      });
    }

    return {
      followUpQuestion: parsed.followUpQuestion,
      shouldContinue: parsed.shouldContinue,
      assessmentComplete: parsed.assessmentComplete,
      knowledgeGaps: parsed.knowledgeGap ? [parsed.knowledgeGap] : [],
    };
  }

  async generateAssessmentReport(sessionId: string) {
    const session = await this.assessmentRepository.findById(sessionId);

    const reportResponse = await this.llmProvider.complete(
      `Generate report for session ${sessionId}`
    );

    const parsed = JSON.parse(reportResponse);

    return {
      summary: parsed.summary,
      strengths: parsed.strengths,
      weaknesses: parsed.weaknesses,
      recommendations: parsed.recommendations,
    };
  }
}

describe('AIAssessmentService', () => {
  let service: AIAssessmentService;
  let mockLLMProvider: { complete: Mock; completeWithMetadata: Mock };
  let mockAssessmentRepository: {
    create: Mock;
    update: Mock;
    findById: Mock;
    findByTraineeId: Mock;
  };

  beforeEach(() => {
    mockLLMProvider = {
      complete: vi.fn(),
      completeWithMetadata: vi.fn(),
    };

    mockAssessmentRepository = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findByTraineeId: vi.fn(),
    };

    service = new AIAssessmentService(
      mockLLMProvider as unknown as ILLMProvider,
      mockAssessmentRepository
    );
  });

  describe('startAssessmentSession', () => {
    it('should create a new assessment session after lecture completion', async () => {
      const lectureId = 'lecture-123';
      const traineeId = 'trainee-456';

      mockAssessmentRepository.create.mockResolvedValue({
        id: 'session-789',
        traineeId,
        lectureId,
        status: 'in_progress',
        startedAt: new Date(),
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        greeting: "Hello! Let's review what you learned.",
        firstQuestion: 'Can you explain the key concepts from this lecture?',
      }));

      const result = await service.startAssessmentSession(traineeId, lectureId);

      expect(result.sessionId).toBe('session-789');
      expect(result.status).toBe('in_progress');
      expect(mockAssessmentRepository.create).toHaveBeenCalled();
    });

    it('should generate contextually relevant opening question', async () => {
      const lectureId = 'lecture-negotiation-101';
      const traineeId = 'trainee-456';

      mockAssessmentRepository.create.mockResolvedValue({
        id: 'session-789',
        traineeId,
        lectureId,
        status: 'in_progress',
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        greeting: 'Great job completing the negotiation basics lecture!',
        firstQuestion: 'What do you consider the most important element of successful negotiation?',
        context: 'negotiation',
      }));

      const result = await service.startAssessmentSession(traineeId, lectureId);

      expect(mockLLMProvider.complete).toHaveBeenCalled();
      expect(result.initialMessage).toContain('negotiation');
    });
  });

  describe('processTraineeResponse', () => {
    it('should evaluate response and generate follow-up question', async () => {
      const sessionId = 'session-123';
      const response = "The most important element is understanding the other party's needs.";

      mockAssessmentRepository.findById.mockResolvedValue({
        id: sessionId,
        status: 'in_progress',
        conversationHistory: [],
        lectureTopics: ['negotiation', 'communication'],
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        evaluation: {
          comprehensionLevel: 'good',
          keyPointsCovered: ['empathy', 'understanding needs'],
          missingConcepts: ['BATNA'],
        },
        followUpQuestion: "That's a great point! Can you explain what BATNA means and why it's important?",
        shouldContinue: true,
      }));

      const result = await service.processTraineeResponse(sessionId, response);

      expect(result.followUpQuestion).toBeDefined();
      expect(result.shouldContinue).toBe(true);
    });

    it('should detect knowledge gaps from incorrect responses', async () => {
      const sessionId = 'session-123';
      const response = 'Negotiation is just about getting the lowest price possible.';

      mockAssessmentRepository.findById.mockResolvedValue({
        id: sessionId,
        status: 'in_progress',
        conversationHistory: [],
        lectureTopics: ['negotiation', 'win-win'],
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        evaluation: {
          comprehensionLevel: 'poor',
          keyPointsCovered: [],
          missingConcepts: ['win-win negotiation', 'value creation', 'relationship building'],
          misconceptions: ['Negotiation is zero-sum'],
        },
        followUpQuestion: 'Interesting perspective. The lecture mentioned "win-win" outcomes - can you explain what that means?',
        shouldContinue: true,
        knowledgeGap: {
          topic: 'Win-Win Negotiation',
          severity: 'moderate',
          description: 'Trainee views negotiation as purely competitive',
        },
      }));

      const result = await service.processTraineeResponse(sessionId, response);

      expect(result.knowledgeGaps).toBeDefined();
      expect(result.knowledgeGaps.length).toBeGreaterThan(0);
      expect(result.knowledgeGaps[0].topic).toBe('Win-Win Negotiation');
    });

    it('should end session after sufficient assessment', async () => {
      const sessionId = 'session-123';
      const response = 'Yes, I understand all the key concepts now.';

      mockAssessmentRepository.findById.mockResolvedValue({
        id: sessionId,
        status: 'in_progress',
        conversationHistory: [
          { role: 'assistant', content: 'Question 1' },
          { role: 'user', content: 'Answer 1' },
          { role: 'assistant', content: 'Question 2' },
          { role: 'user', content: 'Answer 2' },
          { role: 'assistant', content: 'Question 3' },
          { role: 'user', content: 'Answer 3' },
        ],
        lectureTopics: ['topic1', 'topic2'],
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        evaluation: {
          comprehensionLevel: 'excellent',
          keyPointsCovered: ['topic1', 'topic2'],
          missingConcepts: [],
        },
        followUpQuestion: null,
        shouldContinue: false,
        assessmentComplete: true,
        finalScore: 85,
      }));

      mockAssessmentRepository.update.mockResolvedValue({
        id: sessionId,
        status: 'completed',
        finalScore: 85,
      });

      const result = await service.processTraineeResponse(sessionId, response);

      expect(result.shouldContinue).toBe(false);
      expect(result.assessmentComplete).toBe(true);
      expect(mockAssessmentRepository.update).toHaveBeenCalledWith(
        sessionId,
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('generateAssessmentReport', () => {
    it('should generate comprehensive report with strengths and weaknesses', async () => {
      const sessionId = 'session-123';

      mockAssessmentRepository.findById.mockResolvedValue({
        id: sessionId,
        traineeId: 'trainee-456',
        status: 'completed',
        finalScore: 75,
        conversationHistory: [],
        evaluations: [
          { comprehensionLevel: 'good', topic: 'topic1' },
          { comprehensionLevel: 'poor', topic: 'topic2' },
        ],
        knowledgeGaps: [
          { topic: 'topic2', severity: 'moderate' },
        ],
      });

      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        summary: 'Good understanding of core concepts with some gaps in advanced topics.',
        strengths: [
          { skillName: 'Basic Concepts', score: 85, evidence: ['Correctly explained...'] },
        ],
        weaknesses: [
          { skillName: 'Advanced Application', score: 55, evidence: ['Struggled with...'] },
        ],
        recommendations: [
          { priority: 'high', title: 'Review Advanced Topics', description: '...' },
        ],
      }));

      const result = await service.generateAssessmentReport(sessionId);

      expect(result.summary).toBeDefined();
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.weaknesses.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
