import { injectable, inject } from 'tsyringe';
import { IDiagnosticRepository } from '../../repositories/interfaces/diagnostic.repository.interface';
import { IReportRepository } from '../../repositories/interfaces/report.repository.interface';
import { ISimulationRepository } from '../../repositories/interfaces/simulation.repository.interface';
import { IQuizRepository } from '../../repositories/interfaces/quiz.repository.interface';
import { ICourseRepository } from '../../repositories/interfaces/course.repository.interface';
import { ITraineeRepository } from '../../repositories/interfaces/trainee.repository.interface';
import {
  IDiagnosticService,
  DiagnosticStatusOutput,
  TriggerDiagnosticInput,
  TriggerDiagnosticOutput,
  CompleteDiagnosticInput,
  CompleteDiagnosticOutput,
  SkillScores,
  SkillLevel,
  CORE_SKILLS,
} from '../interfaces/diagnostic.interface';
import { EvaluatorService } from '../evaluator/evaluator.service';

const DIAGNOSTIC_THRESHOLD_HOURS = 18;

@injectable()
export class DiagnosticService implements IDiagnosticService {
  constructor(
    @inject('DiagnosticRepository') private diagnosticRepo: IDiagnosticRepository,
    @inject('ReportRepository') private reportRepo: IReportRepository,
    @inject('SimulationRepository') private simulationRepo: ISimulationRepository,
    @inject('QuizRepository') private quizRepo: IQuizRepository,
    @inject('CourseRepository') private courseRepo: ICourseRepository,
    @inject('TraineeRepository') private traineeRepo: ITraineeRepository,
    @inject(EvaluatorService) private evaluatorService: EvaluatorService
  ) {}

  async checkStatus(traineeId: string): Promise<DiagnosticStatusOutput> {
    const latestSession = await this.diagnosticRepo.getLatestSession(traineeId);
    const latestReport = await this.diagnosticRepo.getLatestReport(traineeId);

    // CRITICAL: Check if trainee already has an assigned teacher (from admin or previous evaluation)
    // If they have a teacher, they don't need diagnostic regardless of session history
    const trainee = await this.traineeRepo.findById(traineeId);
    const hasAssignedTeacher = trainee?.assignedTeacher !== null && trainee?.assignedTeacher !== undefined;

    const lastDiagnosticAt = latestSession?.completedAt || null;
    let hoursSinceLast: number | null = null;
    let needsDiagnostic = true;

    // If trainee has an assigned teacher (from admin or previous evaluation), NO diagnostic needed
    if (hasAssignedTeacher) {
      console.log(`[DiagnosticService] Trainee ${traineeId} has assignedTeacher: ${trainee?.assignedTeacher} - no diagnostic needed`);
      needsDiagnostic = false;
    } else if (lastDiagnosticAt) {
      // Otherwise, check time threshold
      hoursSinceLast = (Date.now() - lastDiagnosticAt.getTime()) / (1000 * 60 * 60);
      needsDiagnostic = hoursSinceLast > DIAGNOSTIC_THRESHOLD_HOURS;
    }

    let currentReport: DiagnosticStatusOutput['currentReport'] = null;
    if (latestReport) {
      currentReport = {
        level: latestReport.level as SkillLevel,
        overallScore: latestReport.overallScore,
        skillScores: this.parseSkillScores(latestReport.skillScores),
        strengths: latestReport.strengths,
        weaknesses: latestReport.weaknesses,
        knowledgeGaps: latestReport.knowledgeGaps,
        date: latestReport.date,
      };
    }

    return {
      needsDiagnostic,
      lastDiagnosticAt,
      hoursSinceLast,
      currentReport,
    };
  }

  async triggerDiagnostic(input: TriggerDiagnosticInput): Promise<TriggerDiagnosticOutput> {
    // Check if a recent diagnostic exists
    const status = await this.checkStatus(input.traineeId);

    if (!status.needsDiagnostic && input.triggeredBy === 'system') {
      return {
        diagnosticSessionId: '',
        status: 'skipped_recent',
        lastDiagnosticAt: status.lastDiagnosticAt || undefined,
      };
    }

    // Create a new diagnostic session
    const session = await this.diagnosticRepo.createSession({
      traineeId: input.traineeId,
      triggeredBy: input.triggeredBy,
    });

    // Mark as in_progress
    await this.diagnosticRepo.updateSession(session.id, { status: 'in_progress' });

    return {
      diagnosticSessionId: session.id,
      status: 'started',
    };
  }

  async completeDiagnostic(input: CompleteDiagnosticInput): Promise<CompleteDiagnosticOutput> {
    const session = await this.diagnosticRepo.getSessionById(input.diagnosticSessionId);
    if (!session) {
      throw new Error('Diagnostic session not found');
    }

    // Link simulation and quiz if provided
    if (input.simulationSessionId || input.quizAttemptId) {
      await this.diagnosticRepo.updateSession(session.id, {
        simulationSessionId: input.simulationSessionId,
        quizAttemptId: input.quizAttemptId,
      });
    }

    // Gather skill scores from simulation analysis
    const skillScores = await this.aggregateSkillScores(
      input.traineeId,
      input.simulationSessionId,
      input.quizAttemptId
    );

    // Calculate level and identify strengths/weaknesses
    const overallScore = this.calculateOverallScore(skillScores);
    const level = this.determineLevel(overallScore);
    const { strengths, weaknesses } = this.identifyStrengthsWeaknesses(skillScores);

    // Find knowledge gaps from recent interaction reports
    const knowledgeGaps = await this.extractKnowledgeGaps(input.traineeId);

    // Find recommended courses based on weaknesses
    const recommendedCourseIds = await this.findRecommendedCourses(weaknesses);
    const recommendedTopics = weaknesses.map(w => this.skillToTopic(w));

    // Get today's date (date-only, no time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get previous report for improvement calculation
    const previousReport = await this.diagnosticRepo.getLatestReport(input.traineeId);
    const improvement = previousReport
      ? overallScore - previousReport.overallScore
      : 0;

    const skillScoresJson = JSON.stringify(skillScores);

    // Update the diagnostic session
    await this.diagnosticRepo.updateSession(session.id, {
      overallLevel: level,
      overallScore,
      skillScores: skillScoresJson,
      strengths,
      weaknesses,
      knowledgeGaps,
      status: 'completed',
      completedAt: new Date(),
    });

    // Upsert the daily skill report
    const dailyReport = await this.diagnosticRepo.upsertDailyReport({
      traineeId: input.traineeId,
      date: today,
      level,
      overallScore,
      skillScores: skillScoresJson,
      strengths,
      weaknesses,
      knowledgeGaps,
      diagnosticSessionId: session.id,
      dataSourceIds: JSON.stringify({
        simulationSessionId: input.simulationSessionId,
        quizAttemptId: input.quizAttemptId,
      }),
      recommendedCourseIds,
      recommendedTopics,
    });

    // Update trainee fields
    await this.diagnosticRepo.updateTraineeDiagnosticFields(input.traineeId, {
      lastDiagnosticAt: new Date(),
      currentSkillLevel: level,
    });

    // Fire-and-forget: run Bot 5 evaluator
    this.diagnosticRepo.getTraineeOrganizationId(input.traineeId).then(organizationId => {
      this.evaluatorService.evaluate({
        traineeId: input.traineeId,
        organizationId: organizationId || '',
        diagnosticSessionId: session.id,
        dailySkillReportId: dailyReport.id,
        skillScores,
        overallScore,
        level,
        strengths,
        weaknesses,
        knowledgeGaps,
      }).catch(err => {
        console.error('[DiagnosticService] Bot 5 evaluator failed:', err);
      });
    }).catch(err => {
      console.error('[DiagnosticService] Failed to get trainee org for evaluator:', err);
    });

    return {
      report: {
        level,
        overallScore,
        skillScores,
        strengths,
        weaknesses,
        knowledgeGaps,
        recommendedCourseIds,
        recommendedTopics,
      },
      improvement,
    };
  }

  async buildReportFromHistory(traineeId: string): Promise<CompleteDiagnosticOutput> {
    // Build a skill report from the last 7 days of activity
    const reports = await this.reportRepo.findByTrainee(traineeId, 20);

    const skillAccumulator: Record<string, number[]> = {};
    for (const skill of CORE_SKILLS) {
      skillAccumulator[skill] = [];
    }

    // Extract skill scores from interaction reports
    for (const report of reports) {
      try {
        const summary = typeof report.summary === 'string'
          ? JSON.parse(report.summary)
          : report.summary;

        if (summary && typeof summary === 'object') {
          for (const skill of CORE_SKILLS) {
            const score = summary.skillScores?.[skill]?.score
              ?? summary[skill]
              ?? null;

            if (typeof score === 'number') {
              skillAccumulator[skill].push(score);
            }
          }
        }
      } catch {
        // Skip invalid summary
      }
    }

    // Also factor in recent quiz scores
    const recentAttempts = await this.quizRepo.findAttemptsByTrainee(traineeId);
    const quizAvg = recentAttempts.length > 0
      ? recentAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / recentAttempts.length
      : null;

    // Build skill scores — use report data or fall back to quiz average as proxy for productKnowledge
    const skillScores: SkillScores = {
      communication: this.avgOrDefault(skillAccumulator.communication, 50),
      negotiation: this.avgOrDefault(skillAccumulator.negotiation, 50),
      objectionHandling: this.avgOrDefault(skillAccumulator.objectionHandling, 50),
      relationshipBuilding: this.avgOrDefault(skillAccumulator.relationshipBuilding, 50),
      productKnowledge: quizAvg ?? this.avgOrDefault(skillAccumulator.productKnowledge, 50),
      closingTechnique: this.avgOrDefault(skillAccumulator.closingTechnique, 50),
    };

    const overallScore = this.calculateOverallScore(skillScores);
    const level = this.determineLevel(overallScore);
    const { strengths, weaknesses } = this.identifyStrengthsWeaknesses(skillScores);
    const knowledgeGaps = await this.extractKnowledgeGaps(traineeId);
    const recommendedCourseIds = await this.findRecommendedCourses(weaknesses);
    const recommendedTopics = weaknesses.map(w => this.skillToTopic(w));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const previousReport = await this.diagnosticRepo.getLatestReport(traineeId);
    const improvement = previousReport
      ? overallScore - previousReport.overallScore
      : 0;

    const skillScoresJson = JSON.stringify(skillScores);

    // Upsert report (no diagnostic session attached)
    await this.diagnosticRepo.upsertDailyReport({
      traineeId,
      date: today,
      level,
      overallScore,
      skillScores: skillScoresJson,
      strengths,
      weaknesses,
      knowledgeGaps,
      dataSourceIds: JSON.stringify({ source: 'history', reportCount: reports.length }),
      recommendedCourseIds,
      recommendedTopics,
    });

    await this.diagnosticRepo.updateTraineeDiagnosticFields(traineeId, {
      currentSkillLevel: level,
    });

    return {
      report: {
        level,
        overallScore,
        skillScores,
        strengths,
        weaknesses,
        knowledgeGaps,
        recommendedCourseIds,
        recommendedTopics,
      },
      improvement,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────

  private async aggregateSkillScores(
    traineeId: string,
    simulationSessionId?: string,
    quizAttemptId?: string,
  ): Promise<SkillScores> {
    // IMPORTANT: Default scores are LOW (beginner level)
    // Skills must be EARNED through actual performance
    const DEFAULT_SCORE = 20; // Beginner level - must prove yourself
    const scores: SkillScores = {
      communication: DEFAULT_SCORE,
      negotiation: DEFAULT_SCORE,
      objectionHandling: DEFAULT_SCORE,
      relationshipBuilding: DEFAULT_SCORE,
      productKnowledge: DEFAULT_SCORE,
      closingTechnique: DEFAULT_SCORE,
    };

    let hasActualData = false;

    // Pull from simulation analysis if available
    if (simulationSessionId) {
      const simSession = await this.simulationRepo.findById(simulationSessionId);
      if (simSession?.metrics) {
        try {
          const metrics = typeof simSession.metrics === 'string'
            ? JSON.parse(simSession.metrics)
            : simSession.metrics;

          if (metrics.skillScores) {
            for (const skill of CORE_SKILLS) {
              const val = metrics.skillScores[skill]?.score ?? metrics.skillScores[skill];
              if (typeof val === 'number') {
                scores[skill] = val;
                hasActualData = true;
              }
            }
          }
        } catch {
          // Skip invalid metrics
        }
      }

      // Also check interaction report for this simulation
      const report = await this.reportRepo.findBySourceId(simulationSessionId);
      if (report) {
        try {
          const summary = typeof report.summary === 'string'
            ? JSON.parse(report.summary)
            : report.summary;

          if (summary?.skillScores) {
            for (const skill of CORE_SKILLS) {
              const val = summary.skillScores[skill]?.score ?? summary.skillScores[skill];
              if (typeof val === 'number') {
                scores[skill] = val;
                hasActualData = true;
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // Factor in quiz score as productKnowledge proxy
    if (quizAttemptId) {
      const attempt = await this.quizRepo.findAttemptById(quizAttemptId);
      if (attempt?.score !== null && attempt?.score !== undefined) {
        scores.productKnowledge = Math.round(attempt.score);
        hasActualData = true;
      }
    }

    // If no actual data was found, keep all scores at DEFAULT_SCORE (beginner)
    // This ensures users can't get high scores without doing actual work
    if (!hasActualData) {
      console.log('[DiagnosticService] No actual performance data found, using default beginner scores');
    }

    return scores;
  }

  private calculateOverallScore(scores: SkillScores): number {
    const values = Object.values(scores);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  private determineLevel(score: number): SkillLevel {
    if (score < 40) return 'beginner';
    if (score <= 70) return 'intermediate';
    return 'advanced';
  }

  private identifyStrengthsWeaknesses(scores: SkillScores): {
    strengths: string[];
    weaknesses: string[];
  } {
    const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
    const strengths = entries.slice(0, 2).map(([key]) => key);
    const weaknesses = entries.slice(-2).map(([key]) => key);
    return { strengths, weaknesses };
  }

  private async extractKnowledgeGaps(traineeId: string): Promise<string[]> {
    const reports = await this.reportRepo.findByTrainee(traineeId, 5);
    const gaps = new Set<string>();

    for (const report of reports) {
      try {
        const parsed = typeof report.knowledgeGaps === 'string'
          ? JSON.parse(report.knowledgeGaps)
          : report.knowledgeGaps;

        if (Array.isArray(parsed)) {
          for (const gap of parsed) {
            if (typeof gap === 'string') {
              gaps.add(gap);
            } else if (gap?.topic) {
              gaps.add(gap.topic);
            }
          }
        }
      } catch {
        // Skip invalid
      }
    }

    return [...gaps].slice(0, 5);
  }

  private async findRecommendedCourses(weaknesses: string[]): Promise<string[]> {
    if (weaknesses.length === 0) return [];

    try {
      const courses = await this.courseRepo.findByCompetencyTags(weaknesses);
      return courses.map(c => c.id).slice(0, 5);
    } catch {
      // If course repo doesn't support competencyTags yet, return empty
      return [];
    }
  }

  private parseSkillScores(json: string): SkillScores {
    try {
      return JSON.parse(json);
    } catch {
      return {
        communication: 50,
        negotiation: 50,
        objectionHandling: 50,
        relationshipBuilding: 50,
        productKnowledge: 50,
        closingTechnique: 50,
      };
    }
  }

  private avgOrDefault(scores: number[], defaultVal: number): number {
    if (scores.length === 0) return defaultVal;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  private skillToTopic(skill: string): string {
    const map: Record<string, string> = {
      communication: 'Communication Skills',
      negotiation: 'Negotiation Techniques',
      objectionHandling: 'Objection Handling',
      relationshipBuilding: 'Relationship Building',
      productKnowledge: 'Product Knowledge',
      closingTechnique: 'Closing Techniques',
    };
    return map[skill] || skill;
  }
}
