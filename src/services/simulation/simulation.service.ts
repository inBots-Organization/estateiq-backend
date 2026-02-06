import { injectable, inject } from 'tsyringe';
import { SimulationOutcome, Sentiment, DifficultyLevel } from '../../types/enums';
import { ISimulationRepository } from '../../repositories/interfaces/simulation.repository.interface';
import { IReportRepository } from '../../repositories/interfaces/report.repository.interface';
import { IObjectionHandlingService, ConversationTurn, GeneratedObjection, RaisedObjection } from '../interfaces/objection-handling.interface';
import { IPersonaGeneratorService } from '../interfaces/persona-generator.interface';
import { IConversationStateService } from '../interfaces/conversation-state.interface';
import { IAIEvaluationService, ConversationMessage } from '../interfaces/ai-evaluation.interface';
import {
  ISimulationService,
  StartSimulationInput,
  StartSimulationOutput,
  SimulationMessageInput,
  SimulationMessageOutput,
  EndSimulationInput,
  EndSimulationOutput,
  AnalyzeSimulationInput,
  SimulationAnalysisOutput,
  KeyMoment,
} from '../interfaces/simulation.interface';

interface SimulationState {
  pendingObjections: GeneratedObjection[];
  raisedObjections: RaisedObjection[];
  currentObjection: GeneratedObjection | null;
}

function parseJson<T>(value: string | T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {} as T;
    }
  }
  return value;
}

@injectable()
export class SimulationService implements ISimulationService {
  private simulationStates: Map<string, SimulationState> = new Map();

  constructor(
    @inject('SimulationRepository') private simulationRepository: ISimulationRepository,
    @inject('ReportRepository') private reportRepository: IReportRepository,
    @inject('ObjectionHandlingService') private objectionService: IObjectionHandlingService,
    @inject('PersonaGeneratorService') private personaService: IPersonaGeneratorService,
    @inject('ConversationStateService') private conversationService: IConversationStateService,
    @inject('AIEvaluationService') private aiEvaluationService: IAIEvaluationService
  ) {}

  async startSimulation(input: StartSimulationInput): Promise<StartSimulationOutput> {
    console.log('[SimulationService] Starting simulation...');
    const startTime = Date.now();

    // Step 1: Generate persona (this is the only LLM call needed upfront)
    // Use fast persona generation without LLM for speed
    const persona = await this.personaService.generatePersona({
      scenarioType: input.scenarioType,
      difficultyLevel: input.difficultyLevel,
      customConfig: input.customPersonaConfig,
    });
    console.log('[SimulationService] Persona generated in', Date.now() - startTime, 'ms');

    // Step 2: Create session in database
    const session = await this.simulationRepository.create({
      traineeId: input.traineeId,
      scenarioType: input.scenarioType,
      difficultyLevel: input.difficultyLevel,
      clientPersona: persona as unknown as Record<string, unknown>,
    });

    await this.simulationRepository.update(session.id, {
      status: 'in_progress',
      startedAt: new Date(),
    });
    console.log('[SimulationService] Session created in', Date.now() - startTime, 'ms');

    // Step 3: Run objection generation and initial message generation in PARALLEL
    const [objections, initialMessage] = await Promise.all([
      this.objectionService.generateObjections({
        scenarioType: input.scenarioType,
        difficultyLevel: input.difficultyLevel,
        persona,
        conversationHistory: [],
      }),
      this.personaService.generateInitialMessage(persona, input.scenarioType),
    ]);
    console.log('[SimulationService] Objections & initial message generated in', Date.now() - startTime, 'ms');

    this.simulationStates.set(session.id, {
      pendingObjections: objections,
      raisedObjections: [],
      currentObjection: null,
    });

    await this.simulationRepository.addConversationTurn({
      sessionId: session.id,
      speaker: 'client',
      message: initialMessage,
      sentiment: 'neutral',
      turnNumber: 0,
    });

    console.log('[SimulationService] Total startup time:', Date.now() - startTime, 'ms');

    return {
      sessionId: session.id,
      status: 'ready',
      clientPersona: persona,
      scenarioContext: this.personaService.getScenarioContext(input.scenarioType),
      initialClientMessage: initialMessage,
      estimatedDurationMinutes: this.getEstimatedDuration(input.difficultyLevel),
      tips: this.personaService.getScenarioTips(input.scenarioType),
    };
  }

  async processMessage(input: SimulationMessageInput): Promise<SimulationMessageOutput> {
    const session = await this.simulationRepository.findByIdWithTurns(input.sessionId);
    if (!session) {
      throw new Error('Simulation session not found');
    }

    const persona = parseJson<{
      name: string;
      background: string;
      personality: 'friendly' | 'skeptical' | 'demanding' | 'indecisive' | 'analytical';
      budget: string;
      motivations: string[];
      objections: string[];
      hiddenConcerns: string[];
    }>(session.clientPersona as string);

    const conversationHistory: ConversationTurn[] = session.conversationTurns.map(t => ({
      speaker: t.speaker as 'trainee' | 'client',
      message: t.message,
      timestamp: t.timestamp,
      sentiment: t.sentiment as Sentiment | null,
      detectedIntent: t.detectedIntent ?? null,
    }));

    const turnNumber = conversationHistory.length;

    await this.simulationRepository.addConversationTurn({
      sessionId: input.sessionId,
      speaker: 'trainee',
      message: input.message,
      turnNumber,
    });

    conversationHistory.push({
      speaker: 'trainee',
      message: input.message,
      timestamp: new Date(),
      sentiment: null,
      detectedIntent: null,
    });

    const analysis = await this.conversationService.analyzeMessage(
      input.message,
      conversationHistory,
      persona
    );

    const state = this.simulationStates.get(input.sessionId) || {
      pendingObjections: [],
      raisedObjections: [],
      currentObjection: null,
    };

    let injectedObjection: string | undefined;

    if (state.currentObjection) {
      const evaluation = await this.objectionService.evaluateObjectionHandling(
        state.currentObjection,
        input.message,
        conversationHistory
      );

      const reaction = await this.objectionService.determineClientReaction(evaluation, persona);

      const raisedIndex = state.raisedObjections.findIndex(
        r => r.objection.id === state.currentObjection?.id
      );
      if (raisedIndex >= 0) {
        state.raisedObjections[raisedIndex].traineeResponse = input.message;
        state.raisedObjections[raisedIndex].evaluation = evaluation;
        state.raisedObjections[raisedIndex].resolved = reaction.objectionResolved;
      }

      if (!reaction.objectionResolved && reaction.nextAction === 'escalate') {
        injectedObjection = state.currentObjection.variations[
          Math.floor(Math.random() * state.currentObjection.variations.length)
        ];
      }

      if (reaction.objectionResolved) {
        state.currentObjection = null;
      }
    }

    if (!state.currentObjection && !injectedObjection) {
      const objectionDecision = await this.objectionService.shouldInjectObjection({
        currentTurn: turnNumber,
        conversationState: analysis.currentState,
        lastTraineeMessage: input.message,
        pendingObjections: state.pendingObjections,
        raisedObjections: state.raisedObjections,
        overallSentiment: analysis.sentiment,
        difficultyLevel: session.difficultyLevel as DifficultyLevel,
      });

      if (objectionDecision.shouldInject && objectionDecision.objection) {
        state.currentObjection = objectionDecision.objection;

        state.pendingObjections = state.pendingObjections.filter(
          o => o.id !== objectionDecision.objection!.id
        );

        state.raisedObjections.push({
          objection: objectionDecision.objection,
          raisedAtTurn: turnNumber + 1,
          traineeResponse: null,
          evaluation: null,
          resolved: false,
        });

        injectedObjection = await this.objectionService.formulateObjection(
          objectionDecision.objection,
          persona,
          conversationHistory
        );
      }
    }

    this.simulationStates.set(input.sessionId, state);

    const newState = this.conversationService.determineNextState(
      analysis.currentState,
      analysis,
      turnNumber
    );

    const clientResponse = await this.conversationService.generateClientResponse(
      input.message,
      persona,
      conversationHistory,
      newState,
      injectedObjection
    );

    await this.simulationRepository.addConversationTurn({
      sessionId: input.sessionId,
      speaker: 'client',
      message: clientResponse,
      sentiment: analysis.sentiment,
      detectedIntent: analysis.detectedIntent ?? undefined,
      turnNumber: turnNumber + 1,
    });

    const startTime = session.startedAt || new Date();
    const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);

    return {
      sessionId: input.sessionId,
      clientResponse,
      sentiment: analysis.sentiment === 'positive' ? 'positive' : analysis.sentiment === 'negative' ? 'negative' : 'neutral',
      conversationState: newState,
      hints: analysis.suggestedHints,
      turnNumber: turnNumber + 1,
      elapsedTimeSeconds: elapsedSeconds,
    };
  }

  async endSimulation(input: EndSimulationInput): Promise<EndSimulationOutput> {
    console.log('='.repeat(60));
    console.log('[SimulationService] endSimulation called:', {
      sessionId: input.sessionId,
      endReason: input.endReason,
    });

    const session = await this.simulationRepository.findByIdWithTurns(input.sessionId);
    if (!session) {
      console.error('[SimulationService] Session not found for end:', input.sessionId);
      throw new Error('Simulation session not found');
    }

    console.log('[SimulationService] Ending session:', {
      traineeId: session.traineeId,
      currentStatus: session.status,
      turnCount: session.conversationTurns?.length || 0,
    });

    const startTime = session.startedAt || session.createdAt;
    const durationSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);

    const state = this.simulationStates.get(input.sessionId);
    const resolvedObjections = state?.raisedObjections.filter(r => r.resolved).length || 0;
    const totalObjections = state?.raisedObjections.length || 0;

    const outcome = this.determineOutcome(
      input.endReason,
      session.conversationTurns,
      resolvedObjections,
      totalObjections
    );

    const preliminaryScore = this.calculatePreliminaryScore(state, session.conversationTurns);

    await this.simulationRepository.update(input.sessionId, {
      status: input.endReason === 'completed' ? 'completed' : 'abandoned',
      completedAt: new Date(),
      durationSeconds,
      outcome,
      metrics: {
        turnCount: session.conversationTurns.length,
        resolvedObjections,
        totalObjections,
        preliminaryScore,
      },
    });

    console.log('[SimulationService] Session updated successfully:', {
      newStatus: input.endReason === 'completed' ? 'completed' : 'abandoned',
      durationSeconds,
      outcome,
      preliminaryScore,
      turnCount: session.conversationTurns.length,
    });
    console.log('='.repeat(60));

    this.simulationStates.delete(input.sessionId);

    return {
      sessionId: input.sessionId,
      status: input.endReason === 'completed' ? 'completed' : 'abandoned',
      totalDurationSeconds: durationSeconds,
      turnCount: session.conversationTurns.length,
      preliminaryScore,
      outcome,
      nextSteps: this.getNextSteps(outcome, preliminaryScore),
    };
  }

  async analyzeSimulation(input: AnalyzeSimulationInput): Promise<SimulationAnalysisOutput> {
    console.log('='.repeat(60));
    console.log('[SimulationService] analyzeSimulation called with:', {
      sessionId: input.sessionId,
      generateRecommendations: input.generateRecommendations,
    });

    const session = await this.simulationRepository.findByIdWithTurns(input.sessionId);
    if (!session) {
      console.error('[SimulationService] Session not found:', input.sessionId);
      throw new Error('Simulation session not found');
    }

    console.log('[SimulationService] Session found:', {
      id: session.id,
      traineeId: session.traineeId,
      status: session.status,
      turnCount: session.conversationTurns?.length || 0,
    });

    // Convert conversation turns to the format expected by AI evaluation
    const conversationMessages: ConversationMessage[] = session.conversationTurns.map(turn => ({
      speaker: turn.speaker as 'trainee' | 'client',
      message: turn.message,
      timestamp: turn.timestamp,
    }));

    // Get the client persona
    const clientPersona = parseJson<Record<string, unknown>>(session.clientPersona as string) || {};

    // Use real AI evaluation service
    console.log('[SimulationService] Starting AI evaluation for session:', input.sessionId);
    const aiEvaluation = await this.aiEvaluationService.evaluateConversation(
      conversationMessages,
      session.scenarioType,
      session.difficultyLevel,
      clientPersona
    );
    console.log('[SimulationService] AI evaluation completed:', {
      overallScore: aiEvaluation.overallScore,
      grade: aiEvaluation.grade,
    });

    // Build the analysis output from AI evaluation
    const analysis: SimulationAnalysisOutput = {
      sessionId: input.sessionId,
      traineeId: session.traineeId,
      generatedAt: new Date(),
      overallPerformance: {
        score: aiEvaluation.overallScore,
        grade: aiEvaluation.grade as 'A' | 'B' | 'C' | 'D' | 'F',
        summary: aiEvaluation.summary,
      },
      skillScores: {
        communication: {
          score: aiEvaluation.skillScores.communication.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.communication.evidence,
          tips: aiEvaluation.skillScores.communication.tips,
        },
        negotiation: {
          score: aiEvaluation.skillScores.negotiation.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.negotiation.evidence,
          tips: aiEvaluation.skillScores.negotiation.tips,
        },
        objectionHandling: {
          score: aiEvaluation.skillScores.objectionHandling.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.objectionHandling.evidence,
          tips: aiEvaluation.skillScores.objectionHandling.tips,
        },
        relationshipBuilding: {
          score: aiEvaluation.skillScores.relationshipBuilding.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.relationshipBuilding.evidence,
          tips: aiEvaluation.skillScores.relationshipBuilding.tips,
        },
        productKnowledge: {
          score: aiEvaluation.skillScores.productKnowledge.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.productKnowledge.evidence,
          tips: aiEvaluation.skillScores.productKnowledge.tips,
        },
        closingTechnique: {
          score: aiEvaluation.skillScores.closingTechnique.score,
          benchmark: 75,
          trend: 'stable' as const,
          evidence: aiEvaluation.skillScores.closingTechnique.evidence,
          tips: aiEvaluation.skillScores.closingTechnique.tips,
        },
      },
      conversationAnalysis: {
        talkTimeRatio: aiEvaluation.conversationMetrics.talkTimeRatio,
        averageResponseTime: aiEvaluation.conversationMetrics.averageResponseLength / 10, // Approximate
        questionAsked: aiEvaluation.conversationMetrics.questionsAsked,
        activeListeningIndicators: aiEvaluation.conversationMetrics.activeListeningIndicators,
        empathyStatements: aiEvaluation.conversationMetrics.empathyStatements,
      },
      highlights: this.stringsToKeyMoments(aiEvaluation.highlights, 'strength'),
      improvementAreas: this.stringsToKeyMoments(aiEvaluation.improvementAreas, 'improvement_area'),
      missedOpportunities: [],
      recommendations: this.buildRecommendationsFromAI(aiEvaluation),
      suggestedPracticeScenarios: this.getSuggestedScenarios(aiEvaluation.overallScore) as SimulationAnalysisOutput['suggestedPracticeScenarios'],
    };

    // Store the evaluation in the database with full skill scores
    if (input.generateRecommendations) {
      console.log('[SimulationService] Storing report for trainee:', session.traineeId);

      // Include skill scores in the summary for reports page
      const summaryWithSkills = {
        ...analysis.overallPerformance,
        skillScores: analysis.skillScores,
        conversationAnalysis: analysis.conversationAnalysis,
        scenarioType: session.scenarioType,
        difficultyLevel: session.difficultyLevel,
        durationSeconds: session.durationSeconds,
        turnCount: session.conversationTurns?.length || 0,
      };

      try {
        const report = await this.reportRepository.create({
          traineeId: session.traineeId,
          reportType: 'session',
          sourceType: 'simulation',
          sourceId: input.sessionId,
          summary: summaryWithSkills,
          strengths: analysis.highlights,
          weaknesses: analysis.improvementAreas,
          recommendations: analysis.recommendations,
        });
        console.log('[SimulationService] Report created successfully:', {
          reportId: report.id,
          traineeId: report.traineeId,
          sourceId: report.sourceId,
        });
      } catch (reportError) {
        console.error('[SimulationService] Failed to create report:', reportError);
        // Don't throw - we still want to return the analysis
      }
    } else {
      console.log('[SimulationService] Skipping report creation (generateRecommendations=false)');
    }

    // Update session with final AI-evaluated score
    await this.simulationRepository.update(input.sessionId, {
      metrics: {
        ...parseJson<Record<string, unknown>>(session.metrics as string),
        aiEvaluatedScore: aiEvaluation.overallScore,
        aiGrade: aiEvaluation.grade,
        evaluatedAt: new Date().toISOString(),
      },
    });

    return analysis;
  }

  private buildRecommendationsFromAI(evaluation: {
    overallScore: number;
    improvementAreas: string[];
    skillScores: Record<string, { score: number; tips: string[] }>;
  }): SimulationAnalysisOutput['recommendations'] {
    const recommendations: SimulationAnalysisOutput['recommendations'] = [];

    // Find the weakest skills
    const skillEntries = Object.entries(evaluation.skillScores);
    const sortedSkills = skillEntries.sort((a, b) => a[1].score - b[1].score);

    // Add high priority recommendations for weak skills
    for (const [skillName, skillData] of sortedSkills.slice(0, 2)) {
      if (skillData.score < 70) {
        recommendations.push({
          priority: 'high',
          category: 'practice_skill',
          title: `Improve ${this.formatSkillName(skillName)}`,
          description: `Your ${this.formatSkillName(skillName).toLowerCase()} score is ${skillData.score}/100. Focus on this area.`,
          actionableSteps: skillData.tips.length > 0
            ? skillData.tips
            : [`Practice scenarios focused on ${this.formatSkillName(skillName).toLowerCase()}`],
        });
      }
    }

    // Add medium priority for areas for improvement
    for (const area of evaluation.improvementAreas.slice(0, 2)) {
      recommendations.push({
        priority: 'medium',
        category: 'review_content',
        title: 'Area for Improvement',
        description: area,
        actionableSteps: ['Review this feedback', 'Practice in your next simulation'],
      });
    }

    // Always add a progression recommendation
    if (evaluation.overallScore >= 80) {
      recommendations.push({
        priority: 'low',
        category: 'advance',
        title: 'Try More Challenging Scenarios',
        description: 'Great performance! You\'re ready for harder challenges.',
        actionableSteps: ['Attempt the next difficulty level', 'Try different scenario types'],
      });
    } else {
      recommendations.push({
        priority: 'low',
        category: 'practice_skill',
        title: 'Continue Practicing',
        description: 'Keep practicing at this level to build confidence.',
        actionableSteps: ['Repeat this scenario type', 'Focus on one skill at a time'],
      });
    }

    return recommendations;
  }

  private stringsToKeyMoments(
    strings: string[],
    type: 'strength' | 'improvement_area' | 'missed_opportunity'
  ): KeyMoment[] {
    return strings.map(str => ({
      timestamp: new Date(),
      type,
      description: str,
      recommendation: null,
    }));
  }

  private formatSkillName(skill: string): string {
    const names: Record<string, string> = {
      communication: 'Communication',
      negotiation: 'Negotiation',
      objectionHandling: 'Objection Handling',
      relationshipBuilding: 'Relationship Building',
      productKnowledge: 'Product Knowledge',
      closingTechnique: 'Closing Technique',
    };
    return names[skill] || skill;
  }

  private getSuggestedScenarios(score: number): string[] {
    if (score >= 80) {
      return ['advanced_negotiation', 'difficult_client', 'complex_objection'];
    } else if (score >= 60) {
      return ['objection_handling', 'price_negotiation', 'building_rapport'];
    } else {
      return ['basic_introduction', 'simple_objection', 'needs_assessment'];
    }
  }

  async getSessionById(sessionId: string) {
    return this.simulationRepository.findByIdWithTurns(sessionId);
  }

  private getEstimatedDuration(difficulty: string): number {
    const durations: Record<string, number> = { easy: 10, medium: 15, hard: 20 };
    return durations[difficulty] || 15;
  }

  private determineOutcome(
    endReason: string,
    turns: unknown[],
    resolvedObjections: number,
    totalObjections: number
  ): SimulationOutcome {
    if (endReason !== 'completed') return 'client_declined';

    const resolutionRate = totalObjections > 0 ? resolvedObjections / totalObjections : 1;
    const turnCount = turns.length;

    if (resolutionRate >= 0.8 && turnCount >= 10) return 'deal_closed';
    if (resolutionRate >= 0.6) return 'follow_up_scheduled';
    if (resolutionRate >= 0.4) return 'client_interested';
    if (resolutionRate >= 0.2) return 'client_undecided';
    return 'client_declined';
  }

  private calculatePreliminaryScore(
    state: SimulationState | undefined,
    turns: unknown[]
  ): number {
    let score = 60;

    if (state) {
      const resolved = state.raisedObjections.filter(r => r.resolved).length;
      const total = state.raisedObjections.length;
      if (total > 0) {
        score += (resolved / total) * 25;
      }

      const avgEvalScore = state.raisedObjections
        .filter(r => r.evaluation)
        .reduce((sum, r) => sum + (r.evaluation?.score || 0), 0) / (state.raisedObjections.filter(r => r.evaluation).length || 1);

      score = (score + avgEvalScore) / 2;
    }

    if (turns.length >= 8) score += 5;
    if (turns.length >= 12) score += 5;

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private getNextSteps(outcome: SimulationOutcome, score: number): string[] {
    const steps: string[] = [];

    if (score < 60) {
      steps.push('Review objection handling techniques');
      steps.push('Practice with easier scenarios first');
    } else if (score < 80) {
      steps.push('Focus on closing techniques');
      steps.push('Try a more challenging scenario');
    } else {
      steps.push('Excellent work! Try a harder difficulty');
      steps.push('Practice different scenario types');
    }

    if (outcome === 'client_declined' || outcome === 'relationship_damaged') {
      steps.push('Review the conversation transcript for learning opportunities');
    }

    return steps;
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private generatePerformanceSummary(score: number): string {
    if (score >= 90) return 'Outstanding performance! You demonstrated excellent skills across all areas.';
    if (score >= 80) return 'Great job! You showed strong competency with room for refinement.';
    if (score >= 70) return 'Good effort. Focus on the improvement areas identified to enhance your skills.';
    if (score >= 60) return 'Acceptable performance. Significant improvement needed in key areas.';
    return 'This session highlighted important areas for development. Review the feedback carefully.';
  }

  private generateSkillScore(baseScore: number): {
    score: number;
    benchmark: number;
    trend: 'improving' | 'stable' | 'declining';
    evidence: string[];
    tips: string[];
  } {
    const score = Math.min(100, Math.max(0, baseScore + (Math.random() * 10 - 5)));
    return {
      score: Math.round(score),
      benchmark: 75,
      trend: 'stable',
      evidence: [],
      tips: [],
    };
  }

  private generateRecommendations(score: number): SimulationAnalysisOutput['recommendations'] {
    const recommendations: SimulationAnalysisOutput['recommendations'] = [];

    if (score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'review_content',
        title: 'Review Objection Handling Fundamentals',
        description: 'Your objection handling could be strengthened.',
        actionableSteps: [
          'Review the LAER method (Listen, Acknowledge, Explore, Respond)',
          'Practice acknowledging concerns before responding',
          'Use the feel-felt-found technique',
        ],
      });
    }

    if (score < 80) {
      recommendations.push({
        priority: 'medium',
        category: 'practice_skill',
        title: 'Practice Active Listening',
        description: 'Improve your ability to understand client needs.',
        actionableSteps: [
          'Ask more clarifying questions',
          'Summarize what the client says before responding',
          'Pay attention to emotional cues',
        ],
      });
    }

    recommendations.push({
      priority: 'low',
      category: 'advance',
      title: 'Try More Challenging Scenarios',
      description: 'Continue building your skills with variety.',
      actionableSteps: [
        'Attempt the next difficulty level',
        'Practice with different client personalities',
        'Focus on closing techniques',
      ],
    });

    return recommendations;
  }
}
