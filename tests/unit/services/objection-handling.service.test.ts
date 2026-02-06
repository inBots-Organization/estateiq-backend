import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ObjectionHandlingService } from '../../../src/services/simulation/objection-handling.service';
import type { ILLMProvider } from '../../../src/providers/llm/llm-provider.interface';
import type { IObjectionRepository } from '../../../src/repositories/interfaces/objection.repository.interface';
import type { GeneratedObjection, ConversationContext, ObjectionHandlingEvaluation, ClientPersona } from '../../../src/services/interfaces/objection-handling.interface';

describe('ObjectionHandlingService', () => {
  let service: ObjectionHandlingService;
  let mockLLMProvider: {
    complete: Mock;
    completeWithMetadata: Mock;
  };
  let mockObjectionRepository: {
    getByScenarioType: Mock;
    getByCategory: Mock;
    getCommonObjections: Mock;
    save: Mock;
    seedDefaultObjections: Mock;
  };

  const mockObjection: GeneratedObjection = {
    id: 'obj-1',
    category: 'price_budget',
    severity: 'moderate',
    coreContent: 'The property is above my budget',
    variations: ['Too expensive', 'Above my price range'],
    triggerConditions: ['price mentioned'],
    idealResponses: ['Acknowledge and explore value'],
    commonMistakes: ['Dismissing concerns'],
  };

  beforeEach(() => {
    mockLLMProvider = {
      complete: vi.fn(),
      completeWithMetadata: vi.fn(),
    };

    mockObjectionRepository = {
      getByScenarioType: vi.fn(),
      getByCategory: vi.fn(),
      getCommonObjections: vi.fn(),
      save: vi.fn(),
      seedDefaultObjections: vi.fn(),
    };

    service = new ObjectionHandlingService(
      mockLLMProvider as unknown as ILLMProvider,
      mockObjectionRepository as unknown as IObjectionRepository
    );
  });

  describe('generateObjections', () => {
    it('should generate correct number of objections for easy difficulty', async () => {
      mockObjectionRepository.getByScenarioType.mockResolvedValue([
        mockObjection,
        { ...mockObjection, id: 'obj-2', category: 'timing_urgency' },
        { ...mockObjection, id: 'obj-3', category: 'trust_credibility' },
      ]);

      const context = {
        scenarioType: 'price_negotiation' as const,
        difficultyLevel: 'easy' as const,
        persona: {
          name: 'Test Client',
          background: 'First-time buyer',
          personality: 'friendly' as const,
          budget: '$300,000',
          motivations: ['Find a home'],
          objections: [],
          hiddenConcerns: [],
        },
        conversationHistory: [],
      };

      const result = await service.generateObjections(context);

      expect(result.length).toBeLessThanOrEqual(2);
      expect(mockObjectionRepository.getByScenarioType).toHaveBeenCalledWith('price_negotiation');
    });

    it('should generate more objections for hard difficulty', async () => {
      mockObjectionRepository.getByScenarioType.mockResolvedValue([
        mockObjection,
        { ...mockObjection, id: 'obj-2' },
        { ...mockObjection, id: 'obj-3' },
        { ...mockObjection, id: 'obj-4' },
        { ...mockObjection, id: 'obj-5' },
        { ...mockObjection, id: 'obj-6' },
      ]);

      const context = {
        scenarioType: 'price_negotiation' as const,
        difficultyLevel: 'hard' as const,
        persona: {
          name: 'Test Client',
          background: 'Experienced buyer',
          personality: 'demanding' as const,
          budget: '$500,000',
          motivations: ['Investment'],
          objections: [],
          hiddenConcerns: [],
        },
        conversationHistory: [],
      };

      const result = await service.generateObjections(context);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should return default objections when repository is empty', async () => {
      mockObjectionRepository.getByScenarioType.mockResolvedValue([]);

      const context = {
        scenarioType: 'property_showing' as const,
        difficultyLevel: 'medium' as const,
        persona: {
          name: 'Test Client',
          background: 'Looking for home',
          personality: 'analytical' as const,
          budget: '$400,000',
          motivations: ['Family home'],
          objections: [],
          hiddenConcerns: [],
        },
        conversationHistory: [],
      };

      const result = await service.generateObjections(context);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].coreContent).toBeDefined();
    });
  });

  describe('shouldInjectObjection', () => {
    const baseContext: ConversationContext = {
      currentTurn: 5,
      conversationState: 'presenting',
      lastTraineeMessage: 'Let me show you the features',
      pendingObjections: [mockObjection],
      raisedObjections: [],
      overallSentiment: 'neutral',
      difficultyLevel: 'medium',
    };

    it('should not inject during opening state', async () => {
      const context: ConversationContext = {
        ...baseContext,
        conversationState: 'opening',
      };

      const result = await service.shouldInjectObjection(context);

      expect(result.shouldInject).toBe(false);
      expect(result.reason).toContain('Inappropriate conversation stage');
    });

    it('should not inject during ended state', async () => {
      const context: ConversationContext = {
        ...baseContext,
        conversationState: 'ended',
      };

      const result = await service.shouldInjectObjection(context);

      expect(result.shouldInject).toBe(false);
    });

    it('should not inject when too many unresolved objections', async () => {
      const context: ConversationContext = {
        ...baseContext,
        raisedObjections: [
          { objection: mockObjection, raisedAtTurn: 2, traineeResponse: null, evaluation: null, resolved: false },
          { objection: { ...mockObjection, id: 'obj-2' }, raisedAtTurn: 4, traineeResponse: null, evaluation: null, resolved: false },
        ],
      };

      const result = await service.shouldInjectObjection(context);

      expect(result.shouldInject).toBe(false);
      expect(result.reason).toContain('Too many unresolved objections');
    });

    it('should not inject too soon after last objection', async () => {
      const context: ConversationContext = {
        ...baseContext,
        currentTurn: 5,
        raisedObjections: [
          { objection: mockObjection, raisedAtTurn: 4, traineeResponse: 'Response', evaluation: null, resolved: true },
        ],
      };

      const result = await service.shouldInjectObjection(context);

      expect(result.shouldInject).toBe(false);
      expect(result.reason).toContain('Too soon since last objection');
    });
  });

  describe('evaluateObjectionHandling', () => {
    it('should score high for comprehensive response', async () => {
      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        acknowledged: true,
        empathyShown: true,
        addressedDirectly: true,
        providedValue: true,
        askedFollowUp: true,
        dismissive: false,
        argumentative: false,
        ignoredConcern: false,
        techniquesUsed: ['acknowledge_and_pivot', 'reframe_value'],
        strengths: ['Good acknowledgment'],
        improvements: [],
      }));

      const result = await service.evaluateObjectionHandling(
        mockObjection,
        'I understand your concern about the budget. Many clients initially feel the same way. Let me show you how this property offers excellent value compared to others in the area. Would that help address your concern?',
        []
      );

      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.acknowledged).toBe(true);
      expect(result.empathyShown).toBe(true);
      expect(result.providedValue).toBe(true);
    });

    it('should score low for dismissive response', async () => {
      mockLLMProvider.complete.mockResolvedValue(JSON.stringify({
        acknowledged: false,
        empathyShown: false,
        addressedDirectly: false,
        providedValue: false,
        askedFollowUp: false,
        dismissive: true,
        argumentative: false,
        ignoredConcern: true,
        techniquesUsed: [],
        strengths: [],
        improvements: ['Acknowledge the concern', 'Show empathy'],
      }));

      const result = await service.evaluateObjectionHandling(
        mockObjection,
        'This is actually a great price for the area.',
        []
      );

      expect(result.score).toBeLessThan(40);
      expect(result.feedback).toContain('needs better handling');
    });

    it('should handle LLM parsing errors gracefully', async () => {
      mockLLMProvider.complete.mockResolvedValue('invalid json');

      const result = await service.evaluateObjectionHandling(
        mockObjection,
        'Some response',
        []
      );

      expect(result.score).toBeDefined();
      expect(result.feedback).toBeDefined();
    });
  });

  describe('determineClientReaction', () => {
    const persona: ClientPersona = {
      name: 'Test Client',
      background: 'First-time buyer',
      personality: 'friendly',
      budget: '$300,000',
      motivations: ['Find a home'],
      objections: [],
      hiddenConcerns: [],
    };

    it('should accept when score is high', async () => {
      const evaluation: ObjectionHandlingEvaluation = {
        score: 85,
        acknowledged: true,
        empathyShown: true,
        addressedDirectly: true,
        providedValue: true,
        askedFollowUp: true,
        techniques: ['acknowledge_and_pivot'],
        feedback: 'Excellent',
        improvements: [],
      };

      const result = await service.determineClientReaction(evaluation, persona);

      expect(result.nextAction).toBe('accept');
      expect(result.objectionResolved).toBe(true);
      expect(result.newSentiment).toBe('positive');
    });

    it('should soften when score is moderate', async () => {
      const evaluation: ObjectionHandlingEvaluation = {
        score: 65,
        acknowledged: true,
        empathyShown: true,
        addressedDirectly: false,
        providedValue: false,
        askedFollowUp: false,
        techniques: [],
        feedback: 'Good attempt',
        improvements: ['Address directly'],
      };

      const result = await service.determineClientReaction(evaluation, persona);

      expect(result.nextAction).toBe('soften');
      expect(result.newSentiment).toBe('neutral');
    });

    it('should escalate for demanding personality with low score', async () => {
      const demandingPersona: ClientPersona = { ...persona, personality: 'demanding' };
      const evaluation: ObjectionHandlingEvaluation = {
        score: 35,
        acknowledged: false,
        empathyShown: false,
        addressedDirectly: false,
        providedValue: false,
        askedFollowUp: false,
        techniques: [],
        feedback: 'Needs improvement',
        improvements: ['Everything'],
      };

      const result = await service.determineClientReaction(evaluation, demandingPersona);

      expect(['maintain', 'escalate']).toContain(result.nextAction);
      expect(result.newSentiment).toBe('negative');
    });
  });

  describe('formulateObjection', () => {
    it('should call LLM provider with correct prompt', async () => {
      mockLLMProvider.complete.mockResolvedValue('I need to think about this price more carefully.');

      const persona: ClientPersona = {
        name: 'Sarah Johnson',
        background: 'First-time buyer',
        personality: 'analytical',
        budget: '$350,000',
        motivations: ['Good school district'],
        objections: ['Price seems high'],
        hiddenConcerns: ['Worried about maintenance'],
      };

      const result = await service.formulateObjection(
        mockObjection,
        persona,
        [{ speaker: 'trainee' as const, message: 'The price is $380,000', timestamp: new Date(), sentiment: null, detectedIntent: null }]
      );

      expect(mockLLMProvider.complete).toHaveBeenCalled();
      expect(result).toBe('I need to think about this price more carefully.');
    });
  });
});
