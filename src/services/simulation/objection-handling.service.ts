import { injectable, inject } from 'tsyringe';
import { DifficultyLevel, Sentiment } from '../../types/enums';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { IObjectionRepository } from '../../repositories/interfaces/objection.repository.interface';
import {
  IObjectionHandlingService,
  ObjectionGenerationContext,
  GeneratedObjection,
  ConversationContext,
  ObjectionDecision,
  ClientPersona,
  ConversationTurn,
  ObjectionHandlingEvaluation,
  ClientReaction,
  ObjectionTechnique,
  RaisedObjection,
} from '../interfaces/objection-handling.interface';

@injectable()
export class ObjectionHandlingService implements IObjectionHandlingService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider,
    @inject('ObjectionRepository') private objectionRepository: IObjectionRepository
  ) {}

  async generateObjections(context: ObjectionGenerationContext): Promise<GeneratedObjection[]> {
    const { scenarioType, difficultyLevel, persona } = context;

    const objectionCount = this.getObjectionCount(difficultyLevel);
    const baseObjections = await this.objectionRepository.getByScenarioType(scenarioType);

    if (baseObjections.length === 0) {
      return this.generateDefaultObjections(difficultyLevel);
    }

    const relevantObjections = this.filterByPersona(baseObjections, persona);
    const selected = relevantObjections.slice(0, objectionCount);

    return this.customizeObjections(selected, persona);
  }

  async shouldInjectObjection(context: ConversationContext): Promise<ObjectionDecision> {
    const {
      currentTurn,
      conversationState,
      pendingObjections,
      raisedObjections,
      difficultyLevel,
    } = context;

    if (conversationState === 'opening' || conversationState === 'ended') {
      return { shouldInject: false, reason: 'Inappropriate conversation stage', timing: 'delayed' };
    }

    const unresolvedCount = raisedObjections.filter(o => !o.resolved).length;
    if (unresolvedCount >= 2) {
      return { shouldInject: false, reason: 'Too many unresolved objections', timing: 'delayed' };
    }

    const lastObjectionTurn = this.getLastObjectionTurn(raisedObjections);
    const minTurnGap = this.getMinTurnGap(difficultyLevel);
    if (currentTurn - lastObjectionTurn < minTurnGap) {
      return { shouldInject: false, reason: 'Too soon since last objection', timing: 'delayed' };
    }

    if (pendingObjections.length > 0) {
      const probability = this.getInjectionProbability(difficultyLevel, context);
      if (Math.random() < probability) {
        const objection = this.selectObjection(pendingObjections, context);
        return {
          shouldInject: true,
          objection,
          reason: 'Probabilistic injection based on conversation context',
          timing: 'next_turn',
        };
      }
    }

    return { shouldInject: false, reason: 'No trigger conditions met', timing: 'delayed' };
  }

  async formulateObjection(
    objection: GeneratedObjection,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[]
  ): Promise<string> {
    const prompt = this.buildFormulationPrompt(objection, persona, conversationHistory);

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 200,
      temperature: 0.7,
      systemPrompt: this.getClientPersonaSystemPrompt(persona),
    });

    return this.cleanObjectionResponse(response);
  }

  async evaluateObjectionHandling(
    objection: GeneratedObjection,
    traineeResponse: string,
    conversationContext: ConversationTurn[]
  ): Promise<ObjectionHandlingEvaluation> {
    const analysisPrompt = this.buildEvaluationPrompt(objection, traineeResponse, conversationContext);

    const analysis = await this.llmProvider.complete({
      prompt: analysisPrompt,
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: 'json',
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(analysis);
    } catch {
      parsed = {
        acknowledged: false,
        empathyShown: false,
        addressedDirectly: false,
        providedValue: false,
        askedFollowUp: false,
        dismissive: false,
        argumentative: false,
        ignoredConcern: false,
      };
    }

    const score = this.calculateHandlingScore(parsed);
    const techniques = this.identifyTechniques(traineeResponse, parsed);

    return {
      score,
      acknowledged: !!parsed.acknowledged,
      empathyShown: !!parsed.empathyShown,
      addressedDirectly: !!parsed.addressedDirectly,
      providedValue: !!parsed.providedValue,
      askedFollowUp: !!parsed.askedFollowUp,
      techniques,
      feedback: this.generateFeedback(parsed, score),
      improvements: this.generateImprovements(parsed, objection),
    };
  }

  async determineClientReaction(
    evaluation: ObjectionHandlingEvaluation,
    persona: ClientPersona
  ): Promise<ClientReaction> {
    const { score, addressedDirectly, empathyShown } = evaluation;

    let nextAction: ClientReaction['nextAction'];
    let objectionResolved: boolean;
    let newSentiment: Sentiment;

    if (score >= 80) {
      nextAction = 'accept';
      objectionResolved = true;
      newSentiment = 'positive';
    } else if (score >= 60) {
      nextAction = 'soften';
      objectionResolved = empathyShown && addressedDirectly;
      newSentiment = 'neutral';
    } else if (score >= 40) {
      nextAction = 'maintain';
      objectionResolved = false;
      newSentiment = 'neutral';
    } else {
      nextAction = persona.personality === 'demanding' ? 'escalate' : 'maintain';
      objectionResolved = false;
      newSentiment = 'negative';
    }

    const adjustedReaction = this.adjustForPersonality(
      { nextAction, objectionResolved, newSentiment },
      persona
    );

    return {
      newSentiment: adjustedReaction.newSentiment!,
      objectionResolved: adjustedReaction.objectionResolved!,
      nextAction: adjustedReaction.nextAction!,
      responseGuidance: this.generateResponseGuidance(adjustedReaction, evaluation),
    };
  }

  // Private helper methods

  private getObjectionCount(difficulty: DifficultyLevel): number {
    const counts = { easy: 2, medium: 3, hard: 5 };
    return counts[difficulty];
  }

  private getMinTurnGap(difficulty: DifficultyLevel): number {
    const gaps = { easy: 4, medium: 3, hard: 2 };
    return gaps[difficulty];
  }

  private getLastObjectionTurn(raisedObjections: RaisedObjection[]): number {
    if (raisedObjections.length === 0) return -10;
    return Math.max(...raisedObjections.map(o => o.raisedAtTurn));
  }

  private getInjectionProbability(difficulty: DifficultyLevel, context: ConversationContext): number {
    const baseProbabilities = { easy: 0.1, medium: 0.2, hard: 0.35 };
    let probability = baseProbabilities[difficulty];

    if (context.conversationState === 'negotiating') {
      probability += 0.15;
    }

    const unresolvedCount = context.raisedObjections.filter(o => !o.resolved).length;
    if (unresolvedCount > 0) {
      probability -= 0.1 * unresolvedCount;
    }

    return Math.max(0, Math.min(1, probability));
  }

  private filterByPersona(objections: GeneratedObjection[], persona: ClientPersona): GeneratedObjection[] {
    return objections.filter(objection => {
      if (persona.personality === 'analytical' && objection.category === 'feature_quality') {
        return true;
      }
      if (persona.personality === 'skeptical' && objection.category === 'trust_credibility') {
        return true;
      }
      if (persona.personality === 'demanding' && objection.severity === 'strong') {
        return true;
      }
      return Math.random() > 0.3;
    });
  }

  private selectObjection(objections: GeneratedObjection[], context: ConversationContext): GeneratedObjection {
    const scored = objections.map(o => ({
      objection: o,
      score: this.scoreObjectionRelevance(o, context),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.objection || objections[0];
  }

  private scoreObjectionRelevance(objection: GeneratedObjection, context: ConversationContext): number {
    let score = 50;

    if (context.conversationState === 'negotiating' && objection.category === 'price_budget') {
      score += 20;
    }
    if (context.conversationState === 'presenting' && objection.category === 'feature_quality') {
      score += 15;
    }
    if (context.lastTraineeMessage.toLowerCase().includes('price')) {
      score += 10;
    }

    return score + Math.random() * 10;
  }

  private async customizeObjections(
    objections: GeneratedObjection[],
    persona: ClientPersona
  ): Promise<GeneratedObjection[]> {
    return objections.map(o => ({
      ...o,
      variations: o.variations.map(v =>
        v.replace(/I /g, `As a ${persona.personality} person, I `)
      ),
    }));
  }

  private generateDefaultObjections(difficulty: DifficultyLevel): GeneratedObjection[] {
    const defaults: GeneratedObjection[] = [
      {
        id: 'default-1',
        category: 'price_budget',
        severity: difficulty === 'easy' ? 'soft' : 'moderate',
        coreContent: 'The price seems higher than I expected',
        variations: ['This is above my budget', 'I was hoping for something more affordable'],
        triggerConditions: ['price discussion'],
        idealResponses: ['Acknowledge and explore value'],
        commonMistakes: ['Dismissing concerns'],
      },
      {
        id: 'default-2',
        category: 'timing_urgency',
        severity: 'soft',
        coreContent: 'I need more time to think',
        variations: ['Can I have some time to consider?', 'I want to discuss with my partner'],
        triggerConditions: ['decision point'],
        idealResponses: ['Validate while maintaining engagement'],
        commonMistakes: ['Pressuring'],
      },
    ];

    return defaults.slice(0, this.getObjectionCount(difficulty));
  }

  private buildFormulationPrompt(
    objection: GeneratedObjection,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[]
  ): string {
    const recentTurns = conversationHistory.slice(-4);

    return `
You are ${persona.name}, a ${persona.personality} client with the following background:
${persona.background}

Your concerns: ${persona.objections.join(', ')}

Based on the conversation so far:
${recentTurns.map(t => `${t.speaker}: ${t.message}`).join('\n')}

Express the following objection in your voice (${persona.personality} personality):
Core concern: ${objection.coreContent}
Category: ${objection.category}
Severity: ${objection.severity}

Guidelines:
- Sound natural and conversational
- Match the ${objection.severity} severity level
- Reference specific things mentioned in the conversation if relevant
- Keep response under 50 words

Your objection:`;
  }

  private buildEvaluationPrompt(
    objection: GeneratedObjection,
    traineeResponse: string,
    conversationContext: ConversationTurn[]
  ): string {
    return `
Evaluate how well this real estate sales trainee handled a client objection.

OBJECTION RAISED:
Category: ${objection.category}
Core Concern: ${objection.coreContent}

TRAINEE'S RESPONSE:
"${traineeResponse}"

CONVERSATION CONTEXT:
${conversationContext.slice(-3).map(t => `${t.speaker}: ${t.message}`).join('\n')}

IDEAL RESPONSE ELEMENTS:
${objection.idealResponses.join('\n')}

COMMON MISTAKES TO AVOID:
${objection.commonMistakes.join('\n')}

Analyze the response and return JSON:
{
  "acknowledged": boolean,
  "empathyShown": boolean,
  "addressedDirectly": boolean,
  "providedValue": boolean,
  "askedFollowUp": boolean,
  "dismissive": boolean,
  "argumentative": boolean,
  "ignoredConcern": boolean,
  "techniquesUsed": string[],
  "strengths": string[],
  "improvements": string[]
}`;
  }

  private getClientPersonaSystemPrompt(persona: ClientPersona): string {
    return `You are playing the role of ${persona.name}, a ${persona.personality} real estate client.
Background: ${persona.background}
Budget: ${persona.budget}
Your motivations: ${persona.motivations.join(', ')}
Your hidden concerns: ${persona.hiddenConcerns.join(', ')}

Stay in character and respond naturally as this client would.`;
  }

  private cleanObjectionResponse(response: string): string {
    return response.trim().replace(/^["']|["']$/g, '');
  }

  private calculateHandlingScore(analysis: Record<string, unknown>): number {
    let score = 0;

    if (analysis.acknowledged) score += 20;
    if (analysis.empathyShown) score += 20;
    if (analysis.addressedDirectly) score += 25;
    if (analysis.providedValue) score += 25;
    if (analysis.askedFollowUp) score += 10;
    if (analysis.dismissive) score -= 15;
    if (analysis.argumentative) score -= 20;
    if (analysis.ignoredConcern) score -= 25;

    return Math.max(0, Math.min(100, score));
  }

  private identifyTechniques(response: string, analysis: Record<string, unknown>): ObjectionTechnique[] {
    const techniques: ObjectionTechnique[] = [];
    const lowerResponse = response.toLowerCase();

    if (lowerResponse.includes('understand') && lowerResponse.includes('others')) {
      techniques.push('feel_felt_found');
    }
    if (response.includes('?') && analysis.acknowledged) {
      techniques.push('question_to_understand');
    }
    if (analysis.providedValue && lowerResponse.includes('value')) {
      techniques.push('reframe_value');
    }
    if (lowerResponse.includes('client') || lowerResponse.includes('buyer')) {
      techniques.push('social_proof');
    }

    const llmTechniques = analysis.techniquesUsed as string[] | undefined;
    if (llmTechniques) {
      for (const technique of llmTechniques) {
        const normalized = technique.toLowerCase().replace(/\s+/g, '_') as ObjectionTechnique;
        if (!techniques.includes(normalized)) {
          techniques.push(normalized);
        }
      }
    }

    return techniques;
  }

  private generateFeedback(analysis: Record<string, unknown>, score: number): string {
    if (score >= 80) {
      return 'Excellent objection handling! You acknowledged the concern, showed empathy, and provided a clear solution.';
    } else if (score >= 60) {
      return 'Good attempt at handling the objection. Consider asking a follow-up question to ensure the client feels heard.';
    } else if (score >= 40) {
      return "The objection was partially addressed. Try to acknowledge the client's concern before offering solutions.";
    } else {
      return "This objection needs better handling. Remember to listen, empathize, and address the specific concern raised.";
    }
  }

  private generateImprovements(analysis: Record<string, unknown>, objection: GeneratedObjection): string[] {
    const improvements: string[] = [];

    if (!analysis.acknowledged) {
      improvements.push("Start by acknowledging the client's concern to show you're listening.");
    }
    if (!analysis.empathyShown) {
      improvements.push('Show empathy by expressing understanding of their perspective.');
    }
    if (!analysis.addressedDirectly) {
      improvements.push(`Address the ${objection.category.replace('_', ' ')} concern directly with specific information.`);
    }
    if (!analysis.askedFollowUp) {
      improvements.push("Ask a follow-up question to ensure the client's concern is fully resolved.");
    }

    return improvements.slice(0, 3);
  }

  private generateResponseGuidance(
    reaction: Partial<ClientReaction>,
    evaluation: ObjectionHandlingEvaluation
  ): string {
    switch (reaction.nextAction) {
      case 'accept':
        return 'Client is satisfied. Acknowledge their acceptance warmly and move the conversation forward.';
      case 'soften':
        return 'Client is partially satisfied. They may have a smaller follow-up concern. Be ready to address it briefly.';
      case 'maintain':
        return 'Client still has the concern. They may rephrase or provide more context. Listen carefully and try a different approach.';
      case 'escalate':
        return 'Client is frustrated. They may express stronger concerns or bring up additional objections. Focus on empathy and de-escalation.';
      default:
        return 'Continue the conversation naturally.';
    }
  }

  private adjustForPersonality(
    reaction: Partial<ClientReaction>,
    persona: ClientPersona
  ): Partial<ClientReaction> {
    switch (persona.personality) {
      case 'friendly':
        if (reaction.nextAction === 'maintain') {
          reaction.nextAction = 'soften';
        }
        break;
      case 'skeptical':
        if (reaction.nextAction === 'accept') {
          reaction.nextAction = 'soften';
        }
        break;
      case 'demanding':
        if (reaction.nextAction === 'maintain') {
          reaction.nextAction = Math.random() > 0.5 ? 'escalate' : 'maintain';
        }
        break;
      case 'indecisive':
        if (reaction.nextAction === 'accept') {
          reaction.objectionResolved = Math.random() > 0.3;
        }
        break;
      case 'analytical':
        if (reaction.nextAction === 'soften' && !reaction.objectionResolved) {
          reaction.nextAction = 'maintain';
        }
        break;
    }
    return reaction;
  }
}
