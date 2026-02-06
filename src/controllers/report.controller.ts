import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { IReportingService } from '../services/interfaces/reporting.interface';
import { ISimulationRepository } from '../repositories/interfaces/simulation.repository.interface';
import { IReportRepository } from '../repositories/interfaces/report.repository.interface';
import { ISimulationService } from '../services/interfaces/simulation.interface';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class ReportController {
  public router: Router;

  constructor(
    @inject('ReportingService') private reportingService: IReportingService,
    @inject('SimulationRepository') private simulationRepository: ISimulationRepository,
    @inject('ReportRepository') private reportRepository: IReportRepository,
    @inject('SimulationService') private simulationService: ISimulationService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // User's own reports
    this.router.get(
      '/me',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMyReports.bind(this)
    );

    // User's dashboard data (for reports page)
    this.router.get(
      '/me/dashboard',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMyDashboard.bind(this)
    );

    // User's sessions list with filters
    this.router.get(
      '/me/sessions',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMySessions.bind(this)
    );

    // User's performance trends
    this.router.get(
      '/me/trends',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMyTrends.bind(this)
    );

    // User's skill breakdown
    this.router.get(
      '/me/skills',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMySkills.bind(this)
    );

    // User's recommendations
    this.router.get(
      '/me/recommendations',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getMyRecommendations.bind(this)
    );

    // Session report
    this.router.get(
      '/session/:sessionId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getSessionReport.bind(this)
    );

    this.router.get(
      '/level/:levelId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getLevelReport.bind(this)
    );

    this.router.get(
      '/program/:programId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getProgramReport.bind(this)
    );

    this.router.get(
      '/organization/:organizationId/analytics',
      authMiddleware(['trainer', 'org_admin']),
      this.getOrganizationAnalytics.bind(this)
    );

    // Admin access to any trainee's reports
    this.router.get(
      '/:traineeId/dashboard',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeDashboard.bind(this)
    );

    this.router.get(
      '/:traineeId/sessions',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeSessions.bind(this)
    );

    this.router.get(
      '/:traineeId/trends',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeTrends.bind(this)
    );

    this.router.get(
      '/:traineeId/skills',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeSkills.bind(this)
    );

    this.router.get(
      '/:traineeId/recommendations',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeRecommendations.bind(this)
    );

    // Analyze old sessions that don't have reports yet
    this.router.post(
      '/me/analyze-missing',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.analyzeMyMissingSessions.bind(this)
    );
  }

  private async getMyReports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const reports = await this.reportingService.getTraineeReports(traineeId);
      res.status(200).json(reports);
    } catch (error) {
      next(error);
    }
  }

  private async getMyDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      console.log('[ReportController] getMyDashboard called for traineeId:', traineeId);

      // Get all completed sessions for this user
      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      console.log('[ReportController] Found sessions:', sessions.length, 'for traineeId:', traineeId);

      // Log each session for debugging
      sessions.forEach((s, idx) => {
        console.log(`[ReportController] Session ${idx + 1}:`, {
          id: s.id,
          status: s.status,
          scenarioType: s.scenarioType,
          difficultyLevel: s.difficultyLevel,
          completedAt: s.completedAt,
          metrics: s.metrics ? 'present' : 'null',
        });
      });

      const completedSessions = sessions.filter(s => s.status === 'completed');
      console.log('[ReportController] Completed sessions:', completedSessions.length);

      // Calculate overall stats
      let totalScore = 0;
      let scoredCount = 0;
      const scoreHistory: { date: Date; score: number; sessionId: string }[] = [];

      for (const session of completedSessions) {
        if (session.metrics) {
          try {
            const metrics = typeof session.metrics === 'string'
              ? JSON.parse(session.metrics)
              : session.metrics;
            const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
            if (typeof score === 'number') {
              totalScore += score;
              scoredCount++;
              if (session.completedAt) {
                scoreHistory.push({
                  date: session.completedAt,
                  score,
                  sessionId: session.id,
                });
              }
            }
          } catch {
            // Skip invalid metrics
          }
        }
      }

      // Sort score history by date
      scoreHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Calculate improvement (last 5 vs first 5)
      let improvement = 0;
      if (scoreHistory.length >= 2) {
        const firstHalf = scoreHistory.slice(0, Math.ceil(scoreHistory.length / 2));
        const secondHalf = scoreHistory.slice(Math.ceil(scoreHistory.length / 2));
        const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;
        improvement = Math.round(secondAvg - firstAvg);
      }

      const dashboard = {
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        averageScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
        improvement,
        scoreHistory: scoreHistory.slice(-20), // Last 20 sessions
        recentSessions: completedSessions.slice(0, 5).map(s => ({
          id: s.id,
          scenarioType: s.scenarioType,
          difficultyLevel: s.difficultyLevel,
          completedAt: s.completedAt,
          score: this.extractScore(s.metrics),
          grade: this.extractGrade(s.metrics),
        })),
      };

      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  }

  private async getMySessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { scenarioType, startDate, endDate, page = '1', limit = '10' } = req.query;

      const sessions = await this.simulationRepository.findByTrainee(traineeId);

      // Filter sessions
      let filtered = sessions.filter(s => s.status === 'completed');

      if (scenarioType && scenarioType !== 'all') {
        filtered = filtered.filter(s => s.scenarioType === scenarioType);
      }

      if (startDate) {
        const start = new Date(startDate as string);
        filtered = filtered.filter(s => s.completedAt && s.completedAt >= start);
      }

      if (endDate) {
        const end = new Date(endDate as string);
        filtered = filtered.filter(s => s.completedAt && s.completedAt <= end);
      }

      // Sort by date descending
      filtered.sort((a, b) => {
        const dateA = a.completedAt?.getTime() || 0;
        const dateB = b.completedAt?.getTime() || 0;
        return dateB - dateA;
      });

      // Paginate
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const total = filtered.length;
      const totalPages = Math.ceil(total / limitNum);
      const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      const sessionsWithScores = paginated.map(s => ({
        id: s.id,
        scenarioType: s.scenarioType,
        difficultyLevel: s.difficultyLevel,
        status: s.status,
        completedAt: s.completedAt,
        durationSeconds: s.durationSeconds,
        score: this.extractScore(s.metrics),
        grade: this.extractGrade(s.metrics),
      }));

      res.status(200).json({
        sessions: sessionsWithScores,
        total,
        page: pageNum,
        totalPages,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getMyTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const months = parseInt(req.query.months as string) || 6;

      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      const completedSessions = sessions.filter(s => s.status === 'completed' && s.completedAt);

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      // Filter to recent months
      const recentSessions = completedSessions.filter(s =>
        s.completedAt && s.completedAt >= startDate
      );

      // Group by month
      const monthlyData: Map<string, { scores: number[]; count: number }> = new Map();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (const session of recentSessions) {
        if (!session.completedAt) continue;

        const monthKey = `${session.completedAt.getFullYear()}-${String(session.completedAt.getMonth() + 1).padStart(2, '0')}`;
        const score = this.extractScore(session.metrics);

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, { scores: [], count: 0 });
        }

        const data = monthlyData.get(monthKey)!;
        data.count++;
        if (score !== null) {
          data.scores.push(score);
        }
      }

      // Convert to array
      const trends = Array.from(monthlyData.entries()).map(([key, data]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          month: monthNames[month - 1],
          year,
          averageScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : null,
          sessionCount: data.count,
        };
      });

      // Sort by date
      trends.sort((a, b) => {
        const monthIndexA = monthNames.indexOf(a.month);
        const monthIndexB = monthNames.indexOf(b.month);
        return a.year !== b.year ? a.year - b.year : monthIndexA - monthIndexB;
      });

      res.status(200).json(trends);
    } catch (error) {
      next(error);
    }
  }

  private async getMySkills(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const lang = this.getLanguageFromRequest(req);
      console.log('[ReportController] getMySkills called for traineeId:', traineeId, 'lang:', lang);

      // Get all reports for this user
      const reports = await this.reportRepository.findByTrainee(traineeId);
      console.log('[ReportController] Found reports:', reports.length, 'for traineeId:', traineeId);

      // Aggregate skill scores
      const skillData: Map<string, { scores: number[]; tips: string[]; evidence: string[] }> = new Map();
      const skills = ['communication', 'negotiation', 'objectionHandling', 'relationshipBuilding', 'productKnowledge', 'closingTechnique'];

      for (const skill of skills) {
        skillData.set(skill, { scores: [], tips: [], evidence: [] });
      }

      for (const report of reports) {
        try {
          const summary = typeof report.summary === 'string'
            ? JSON.parse(report.summary)
            : report.summary;

          // Try to extract skill scores from summary
          if (summary && typeof summary === 'object') {
            for (const skill of skills) {
              // Check multiple locations for the skill score
              const skillScore = summary.skillScores?.[skill]?.score
                ?? summary[skill]
                ?? null;

              if (typeof skillScore === 'number') {
                skillData.get(skill)!.scores.push(skillScore);
              }

              // Get tips from skillScores
              const tips = summary.skillScores?.[skill]?.tips;
              if (Array.isArray(tips)) {
                skillData.get(skill)!.tips.push(...tips);
              }

              // Get evidence from skillScores
              const evidence = summary.skillScores?.[skill]?.evidence;
              if (Array.isArray(evidence)) {
                skillData.get(skill)!.evidence.push(...evidence);
              }
            }
          }
        } catch {
          // Skip invalid summary
        }
      }

      const skillBreakdown = skills.map(skill => {
        const data = skillData.get(skill)!;
        const avgScore = data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : null;

        // Get unique tips
        const uniqueTips = [...new Set(data.tips)].slice(0, 3);

        return {
          skill: this.formatSkillName(skill, lang),
          skillKey: skill,
          averageScore: avgScore,
          sessionCount: data.scores.length,
          benchmark: 75,
          tips: uniqueTips,
          isStrength: avgScore !== null && avgScore >= 75,
          isWeakness: avgScore !== null && avgScore < 60,
        };
      });

      // Find strongest and weakest skills
      const scoredSkills = skillBreakdown.filter(s => s.averageScore !== null);
      scoredSkills.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

      const strengths = scoredSkills.filter(s => s.isStrength).slice(0, 2);
      const weaknesses = scoredSkills.filter(s => s.isWeakness).slice(0, 2);

      res.status(200).json({
        skills: skillBreakdown,
        strengths: strengths.map(s => s.skill),
        weaknesses: weaknesses.map(s => s.skill),
      });
    } catch (error) {
      next(error);
    }
  }

  private async getMyRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const lang = this.getLanguageFromRequest(req);

      // Get user's skill data
      const reports = await this.reportRepository.findByTrainee(traineeId);

      // Aggregate recommendations and identify weak areas
      const allRecommendations: { priority: string; title: string; description: string; category: string }[] = [];
      const skillScores: Map<string, number[]> = new Map();

      for (const report of reports) {
        try {
          const recommendations = typeof report.recommendations === 'string'
            ? JSON.parse(report.recommendations)
            : report.recommendations;

          if (Array.isArray(recommendations)) {
            allRecommendations.push(...recommendations);
          }

          const summary = typeof report.summary === 'string'
            ? JSON.parse(report.summary)
            : report.summary;

          if (summary?.skillScores) {
            for (const [skill, data] of Object.entries(summary.skillScores)) {
              const score = (data as { score?: number })?.score;
              if (typeof score === 'number') {
                if (!skillScores.has(skill)) {
                  skillScores.set(skill, []);
                }
                skillScores.get(skill)!.push(score);
              }
            }
          }
        } catch {
          // Skip invalid data
        }
      }

      // Find weak skills
      const weakSkills: string[] = [];
      for (const [skill, scores] of skillScores) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < 60) {
          weakSkills.push(this.formatSkillName(skill, lang));
        }
      }

      // Generate suggested courses based on weak skills
      const suggestedCourses = this.generateCourseSuggestions(weakSkills, lang);

      // Deduplicate and prioritize recommendations
      const uniqueRecs = allRecommendations.reduce((acc, rec) => {
        const key = rec.title;
        if (!acc.some(r => r.title === key)) {
          acc.push(rec);
        }
        return acc;
      }, [] as typeof allRecommendations);

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      uniqueRecs.sort((a, b) =>
        (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] || 2)
      );

      res.status(200).json({
        recommendations: uniqueRecs.slice(0, 5),
        weakSkills,
        suggestedCourses,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getSessionReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const traineeId = req.user!.userId;

      const report = await this.reportingService.generateSessionReport(sessionId, traineeId);

      res.status(200).json(report);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async getLevelReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { levelId } = req.params;
      const traineeId = req.query.traineeId as string || req.user!.userId;

      const report = await this.reportingService.generateLevelReport(levelId, traineeId);

      res.status(200).json(report);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async getProgramReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { programId } = req.params;
      const traineeId = req.query.traineeId as string || req.user!.userId;

      const report = await this.reportingService.generateProgramReport(programId, traineeId);

      res.status(200).json(report);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async getOrganizationAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { organizationId } = req.params;

      const analytics = await this.reportingService.getOrganizationAnalytics(organizationId);

      res.status(200).json(analytics);
    } catch (error) {
      next(error);
    }
  }

  // Admin endpoints for viewing any trainee's reports
  private async getTraineeDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.params.traineeId;
      console.log('[ReportController] getTraineeDashboard (admin) called for traineeId:', traineeId);

      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      const completedSessions = sessions.filter(s => s.status === 'completed');

      let totalScore = 0;
      let scoredCount = 0;
      const scoreHistory: { date: Date; score: number; sessionId: string }[] = [];

      for (const session of completedSessions) {
        if (session.metrics) {
          try {
            const metrics = typeof session.metrics === 'string'
              ? JSON.parse(session.metrics)
              : session.metrics;
            const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
            if (typeof score === 'number') {
              totalScore += score;
              scoredCount++;
              if (session.completedAt) {
                scoreHistory.push({
                  date: session.completedAt,
                  score,
                  sessionId: session.id,
                });
              }
            }
          } catch {
            // Skip invalid metrics
          }
        }
      }

      scoreHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

      let improvement = 0;
      if (scoreHistory.length >= 2) {
        const firstHalf = scoreHistory.slice(0, Math.ceil(scoreHistory.length / 2));
        const secondHalf = scoreHistory.slice(Math.ceil(scoreHistory.length / 2));
        const firstAvg = firstHalf.reduce((sum, s) => sum + s.score, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, s) => sum + s.score, 0) / secondHalf.length;
        improvement = Math.round(secondAvg - firstAvg);
      }

      const dashboard = {
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        averageScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
        improvement,
        scoreHistory: scoreHistory.slice(-20),
        recentSessions: completedSessions.slice(0, 5).map(s => ({
          id: s.id,
          scenarioType: s.scenarioType,
          difficultyLevel: s.difficultyLevel,
          completedAt: s.completedAt,
          score: this.extractScore(s.metrics),
          grade: this.extractGrade(s.metrics),
        })),
      };

      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.params.traineeId;
      const { scenarioType, startDate, endDate, page = '1', limit = '10' } = req.query;

      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      let filtered = sessions.filter(s => s.status === 'completed');

      if (scenarioType && scenarioType !== 'all') {
        filtered = filtered.filter(s => s.scenarioType === scenarioType);
      }

      if (startDate) {
        const start = new Date(startDate as string);
        filtered = filtered.filter(s => s.completedAt && s.completedAt >= start);
      }

      if (endDate) {
        const end = new Date(endDate as string);
        filtered = filtered.filter(s => s.completedAt && s.completedAt <= end);
      }

      filtered.sort((a, b) => {
        const dateA = a.completedAt?.getTime() || 0;
        const dateB = b.completedAt?.getTime() || 0;
        return dateB - dateA;
      });

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const total = filtered.length;
      const totalPages = Math.ceil(total / limitNum);
      const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      const sessionsWithScores = paginated.map(s => ({
        id: s.id,
        scenarioType: s.scenarioType,
        difficultyLevel: s.difficultyLevel,
        status: s.status,
        completedAt: s.completedAt,
        durationSeconds: s.durationSeconds,
        score: this.extractScore(s.metrics),
        grade: this.extractGrade(s.metrics),
      }));

      res.status(200).json({
        sessions: sessionsWithScores,
        total,
        page: pageNum,
        totalPages,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.params.traineeId;
      const months = parseInt(req.query.months as string) || 6;

      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      const completedSessions = sessions.filter(s => s.status === 'completed' && s.completedAt);

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const recentSessions = completedSessions.filter(s =>
        s.completedAt && s.completedAt >= startDate
      );

      const monthlyData: Map<string, { scores: number[]; count: number }> = new Map();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      for (const session of recentSessions) {
        if (!session.completedAt) continue;

        const monthKey = `${session.completedAt.getFullYear()}-${String(session.completedAt.getMonth() + 1).padStart(2, '0')}`;
        const score = this.extractScore(session.metrics);

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, { scores: [], count: 0 });
        }

        const data = monthlyData.get(monthKey)!;
        data.count++;
        if (score !== null) {
          data.scores.push(score);
        }
      }

      const trends = Array.from(monthlyData.entries()).map(([key, data]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          month: monthNames[month - 1],
          year,
          averageScore: data.scores.length > 0
            ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
            : null,
          sessionCount: data.count,
        };
      });

      trends.sort((a, b) => {
        const monthIndexA = monthNames.indexOf(a.month);
        const monthIndexB = monthNames.indexOf(b.month);
        return a.year !== b.year ? a.year - b.year : monthIndexA - monthIndexB;
      });

      res.status(200).json(trends);
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeSkills(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.params.traineeId;
      const lang = this.getLanguageFromRequest(req);

      const reports = await this.reportRepository.findByTrainee(traineeId);

      const skillData: Map<string, { scores: number[]; tips: string[]; evidence: string[] }> = new Map();
      const skills = ['communication', 'negotiation', 'objectionHandling', 'relationshipBuilding', 'productKnowledge', 'closingTechnique'];

      for (const skill of skills) {
        skillData.set(skill, { scores: [], tips: [], evidence: [] });
      }

      // First try to get skills from reports
      for (const report of reports) {
        try {
          const summary = typeof report.summary === 'string'
            ? JSON.parse(report.summary)
            : report.summary;

          if (summary && typeof summary === 'object') {
            for (const skill of skills) {
              const skillScore = summary.skillScores?.[skill]?.score
                ?? summary[skill]
                ?? null;

              if (typeof skillScore === 'number') {
                skillData.get(skill)!.scores.push(skillScore);
              }

              const tips = summary.skillScores?.[skill]?.tips;
              if (Array.isArray(tips)) {
                skillData.get(skill)!.tips.push(...tips);
              }

              const evidence = summary.skillScores?.[skill]?.evidence;
              if (Array.isArray(evidence)) {
                skillData.get(skill)!.evidence.push(...evidence);
              }
            }
          }
        } catch {
          // Skip invalid summary
        }
      }

      // If no skill data found from reports, calculate from simulation metrics
      const hasAnySkillData = Array.from(skillData.values()).some(d => d.scores.length > 0);

      if (!hasAnySkillData) {
        // Get completed simulations and calculate skill scores based on metrics
        const simulations = await this.simulationRepository.findByTrainee(traineeId);
        const completedSims = simulations.filter(s => s.status === 'completed');

        for (const sim of completedSims) {
          try {
            const metrics = typeof sim.metrics === 'string'
              ? JSON.parse(sim.metrics)
              : sim.metrics;

            if (metrics) {
              // Calculate skill scores based on available metrics
              const baseScore = metrics.preliminaryScore || metrics.overallScore || 65;
              const turnCount = metrics.turnCount || 5;
              const durationMinutes = (sim.durationSeconds || 300) / 60;

              // Communication: based on turn count and response quality
              const commScore = Math.min(100, Math.max(40, baseScore + (turnCount > 8 ? 10 : 0)));
              skillData.get('communication')!.scores.push(commScore);

              // Negotiation: based on session duration and difficulty
              const difficultyBonus = sim.difficultyLevel === 'hard' ? 10 : sim.difficultyLevel === 'medium' ? 5 : 0;
              const negoScore = Math.min(100, Math.max(40, baseScore - 5 + difficultyBonus));
              skillData.get('negotiation')!.scores.push(negoScore);

              // Objection Handling: based on base score and scenario type
              const objScore = Math.min(100, Math.max(40, baseScore - 3 + (sim.scenarioType === 'objection_handling' ? 8 : 0)));
              skillData.get('objectionHandling')!.scores.push(objScore);

              // Relationship Building: based on engagement (turn count + duration)
              const relScore = Math.min(100, Math.max(40, baseScore + (turnCount > 6 ? 5 : 0) + (durationMinutes > 5 ? 5 : 0)));
              skillData.get('relationshipBuilding')!.scores.push(relScore);

              // Product Knowledge: based on response depth
              const pkScore = Math.min(100, Math.max(40, baseScore - 5 + (turnCount > 10 ? 8 : 0)));
              skillData.get('productKnowledge')!.scores.push(pkScore);

              // Closing Technique: based on session completion and score
              const closeScore = Math.min(100, Math.max(40, baseScore - 8 + (sim.outcome === 'success' ? 15 : 0)));
              skillData.get('closingTechnique')!.scores.push(closeScore);
            }
          } catch {
            // Skip invalid metrics
          }
        }

        // Add generic tips if calculated from simulations
        if (completedSims.length > 0) {
          const isArabic = lang === 'ar';
          skillData.get('communication')!.tips.push(
            isArabic ? 'واصل التدريب على التواصل الواضح مع العملاء' : 'Continue practicing clear client communication'
          );
          skillData.get('negotiation')!.tips.push(
            isArabic ? 'ركز على فهم احتياجات العميل قبل تقديم العروض' : 'Focus on understanding client needs before offering solutions'
          );
          skillData.get('objectionHandling')!.tips.push(
            isArabic ? 'تدرب على الاستماع الفعال ومعالجة المخاوف' : 'Practice active listening and addressing concerns'
          );
          skillData.get('relationshipBuilding')!.tips.push(
            isArabic ? 'ابني علاقة ثقة مع العميل من خلال التعاطف' : 'Build trust through empathy and genuine interest'
          );
          skillData.get('productKnowledge')!.tips.push(
            isArabic ? 'راجع تفاصيل العقارات والمنتجات بانتظام' : 'Regularly review property details and product knowledge'
          );
          skillData.get('closingTechnique')!.tips.push(
            isArabic ? 'تعلم تقنيات الإغلاق المختلفة وطبقها' : 'Learn various closing techniques and apply them'
          );
        }
      }

      const skillBreakdown = skills.map(skill => {
        const data = skillData.get(skill)!;
        const avgScore = data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : null;

        const uniqueTips = [...new Set(data.tips)].slice(0, 3);

        return {
          skill: this.formatSkillName(skill, lang),
          skillKey: skill,
          averageScore: avgScore,
          sessionCount: data.scores.length,
          benchmark: 75,
          tips: uniqueTips,
          isStrength: avgScore !== null && avgScore >= 75,
          isWeakness: avgScore !== null && avgScore < 60,
        };
      });

      const scoredSkills = skillBreakdown.filter(s => s.averageScore !== null);
      scoredSkills.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

      const strengths = scoredSkills.filter(s => s.isStrength).slice(0, 2);
      const weaknesses = scoredSkills.filter(s => s.isWeakness).slice(0, 2);

      res.status(200).json({
        skills: skillBreakdown,
        strengths: strengths.map(s => s.skill),
        weaknesses: weaknesses.map(s => s.skill),
      });
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.params.traineeId;
      const lang = this.getLanguageFromRequest(req);

      const reports = await this.reportRepository.findByTrainee(traineeId);

      const allRecommendations: { priority: string; title: string; description: string; category: string }[] = [];
      const skillScores: Map<string, number[]> = new Map();

      for (const report of reports) {
        try {
          const recommendations = typeof report.recommendations === 'string'
            ? JSON.parse(report.recommendations)
            : report.recommendations;

          if (Array.isArray(recommendations)) {
            allRecommendations.push(...recommendations);
          }

          const summary = typeof report.summary === 'string'
            ? JSON.parse(report.summary)
            : report.summary;

          if (summary?.skillScores) {
            for (const [skill, data] of Object.entries(summary.skillScores)) {
              const score = (data as { score?: number })?.score;
              if (typeof score === 'number') {
                if (!skillScores.has(skill)) {
                  skillScores.set(skill, []);
                }
                skillScores.get(skill)!.push(score);
              }
            }
          }
        } catch {
          // Skip invalid data
        }
      }

      const weakSkills: string[] = [];
      for (const [skill, scores] of skillScores) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < 60) {
          weakSkills.push(this.formatSkillName(skill, lang));
        }
      }

      const suggestedCourses = this.generateCourseSuggestions(weakSkills, lang);

      const uniqueRecs = allRecommendations.reduce((acc, rec) => {
        const key = rec.title;
        if (!acc.some(r => r.title === key)) {
          acc.push(rec);
        }
        return acc;
      }, [] as typeof allRecommendations);

      const priorityOrder = { high: 0, medium: 1, low: 2 };
      uniqueRecs.sort((a, b) =>
        (priorityOrder[a.priority as keyof typeof priorityOrder] || 2) -
        (priorityOrder[b.priority as keyof typeof priorityOrder] || 2)
      );

      res.status(200).json({
        recommendations: uniqueRecs.slice(0, 5),
        weakSkills,
        suggestedCourses,
      });
    } catch (error) {
      next(error);
    }
  }

  private extractScore(metrics: unknown): number | null {
    if (!metrics) return null;
    try {
      const m = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
      return m.aiEvaluatedScore ?? m.preliminaryScore ?? null;
    } catch {
      return null;
    }
  }

  private extractGrade(metrics: unknown): string | null {
    if (!metrics) return null;
    try {
      const m = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
      return m.aiGrade ?? null;
    } catch {
      return null;
    }
  }

  private formatSkillName(skill: string, lang: string = 'en'): string {
    const names: Record<string, Record<string, string>> = {
      en: {
        communication: 'Communication',
        negotiation: 'Negotiation',
        objectionHandling: 'Objection Handling',
        relationshipBuilding: 'Relationship Building',
        productKnowledge: 'Product Knowledge',
        closingTechnique: 'Closing Technique',
      },
      ar: {
        communication: 'التواصل',
        negotiation: 'التفاوض',
        objectionHandling: 'معالجة الاعتراضات',
        relationshipBuilding: 'بناء العلاقات',
        productKnowledge: 'المعرفة بالمنتج',
        closingTechnique: 'تقنيات الإغلاق',
      },
    };
    return names[lang]?.[skill] || names['en'][skill] || skill;
  }

  private generateCourseSuggestions(weakSkills: string[], lang: string = 'en'): { title: string; reason: string }[] {
    const suggestions: { title: string; reason: string }[] = [];

    const courseData: Record<string, Record<string, { title: string; reason: string }>> = {
      en: {
        Communication: {
          title: 'Effective Client Communication',
          reason: 'Improve your communication score by learning clear and persuasive speaking techniques.',
        },
        'Objection Handling': {
          title: 'Mastering Objection Handling',
          reason: 'Learn proven techniques like LAER method to address client concerns effectively.',
        },
        'Closing Technique': {
          title: 'Closing Strategies for Real Estate',
          reason: 'Develop your ability to recognize buying signals and close deals confidently.',
        },
        'Relationship Building': {
          title: 'Building Client Relationships',
          reason: 'Learn rapport-building techniques to create lasting client relationships.',
        },
        'Product Knowledge': {
          title: 'Real Estate Market Fundamentals',
          reason: 'Strengthen your knowledge base to answer client questions confidently.',
        },
        Negotiation: {
          title: 'Negotiation Mastery',
          reason: 'Learn advanced negotiation strategies to achieve better outcomes.',
        },
      },
      ar: {
        التواصل: {
          title: 'التواصل الفعال مع العملاء',
          reason: 'حسّن مهارات التواصل لديك من خلال تعلم تقنيات الحديث الواضح والمقنع.',
        },
        'معالجة الاعتراضات': {
          title: 'إتقان معالجة الاعتراضات',
          reason: 'تعلم تقنيات مثبتة للتعامل مع مخاوف العملاء بفعالية.',
        },
        'تقنيات الإغلاق': {
          title: 'استراتيجيات إتمام الصفقات العقارية',
          reason: 'طور قدرتك على التعرف على إشارات الشراء وإغلاق الصفقات بثقة.',
        },
        'بناء العلاقات': {
          title: 'بناء علاقات مع العملاء',
          reason: 'تعلم تقنيات بناء الألفة لإنشاء علاقات دائمة مع العملاء.',
        },
        'المعرفة بالمنتج': {
          title: 'أساسيات السوق العقاري',
          reason: 'عزز قاعدة معرفتك للإجابة على أسئلة العملاء بثقة.',
        },
        التفاوض: {
          title: 'إتقان التفاوض',
          reason: 'تعلم استراتيجيات التفاوض المتقدمة لتحقيق نتائج أفضل.',
        },
      },
    };

    const data = courseData[lang] || courseData['en'];

    for (const skill of weakSkills) {
      if (data[skill]) {
        suggestions.push(data[skill]);
      }
    }

    return suggestions;
  }

  private getLanguageFromRequest(req: Request): string {
    const acceptLanguage = req.headers['accept-language'] || '';
    return acceptLanguage.startsWith('ar') ? 'ar' : 'en';
  }

  /**
   * Analyze completed sessions that don't have reports yet
   * This helps fill in skill data for historical sessions
   */
  private async analyzeMyMissingSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      console.log('[ReportController] analyzeMyMissingSessions called for traineeId:', traineeId);

      // Get all completed sessions for this user
      const sessions = await this.simulationRepository.findByTrainee(traineeId);
      const completedSessions = sessions.filter(s => s.status === 'completed');

      console.log('[ReportController] Found', completedSessions.length, 'completed sessions');

      const results = {
        total: completedSessions.length,
        analyzed: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const session of completedSessions) {
        try {
          // Check if report already exists
          const existingReport = await this.reportRepository.findBySourceId(session.id);
          if (existingReport) {
            console.log('[ReportController] Session', session.id, 'already has a report');
            results.skipped++;
            continue;
          }

          console.log('[ReportController] Analyzing session:', session.id);

          // Analyze the session
          await this.simulationService.analyzeSimulation({
            sessionId: session.id,
            includeDetailedTranscriptAnalysis: false,
            compareToHistory: false,
            generateRecommendations: true,
          });

          console.log('[ReportController] Successfully analyzed session:', session.id);
          results.analyzed++;

        } catch (error) {
          console.error('[ReportController] Failed to analyze session:', session.id, error);
          results.failed++;
          results.errors.push(`Session ${session.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      res.status(200).json({
        message: 'Analysis complete',
        results,
      });
    } catch (error) {
      next(error);
    }
  }
}
