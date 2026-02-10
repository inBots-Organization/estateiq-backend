import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { IDiagnosticService } from '../services/interfaces/diagnostic.interface';

@injectable()
export class DiagnosticController {
  public router: Router;

  constructor(
    @inject('DiagnosticService') private diagnosticService: IDiagnosticService,
    @inject('PrismaClient') private prisma: PrismaClient
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Check if trainee needs a diagnostic
    this.router.get(
      '/status',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.checkStatus.bind(this)
    );

    // Trigger a new diagnostic session
    this.router.post(
      '/trigger',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.triggerDiagnostic.bind(this)
    );

    // Complete a diagnostic and generate report
    this.router.post(
      '/complete',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.completeDiagnostic.bind(this)
    );

    // Build report from history (no formal diagnostic)
    this.router.post(
      '/build-from-history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.buildFromHistory.bind(this)
    );

    // Get latest skill report
    this.router.get(
      '/report/latest',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getLatestReport.bind(this)
    );

    // Get report history
    this.router.get(
      '/report/history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getReportHistory.bind(this)
    );

    // Get evaluator report (Bot 5)
    this.router.get(
      '/evaluator-report',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getEvaluatorReport.bind(this)
    );
  }

  private async checkStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const result = await this.diagnosticService.checkStatus(traineeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async triggerDiagnostic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const triggeredBy = (req.body.triggeredBy as 'system' | 'manual') || 'manual';

      const result = await this.diagnosticService.triggerDiagnostic({
        traineeId,
        triggeredBy,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async completeDiagnostic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { diagnosticSessionId, simulationSessionId, quizAttemptId } = req.body;

      if (!diagnosticSessionId) {
        res.status(400).json({ error: 'diagnosticSessionId is required' });
        return;
      }

      const result = await this.diagnosticService.completeDiagnostic({
        diagnosticSessionId,
        traineeId,
        simulationSessionId,
        quizAttemptId,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async buildFromHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const result = await this.diagnosticService.buildReportFromHistory(traineeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getLatestReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const status = await this.diagnosticService.checkStatus(traineeId);

      if (!status.currentReport) {
        res.status(404).json({ error: 'No skill report found' });
        return;
      }

      res.status(200).json(status.currentReport);
    } catch (error) {
      next(error);
    }
  }

  private async getReportHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const days = parseInt(req.query.days as string) || 30;

      // Use checkStatus for latest + build history from service
      const status = await this.diagnosticService.checkStatus(traineeId);

      res.status(200).json({
        currentReport: status.currentReport,
        needsDiagnostic: status.needsDiagnostic,
        hoursSinceLast: status.hoursSinceLast,
      });
    } catch (error) {
      next(error);
    }
  }

  private async getEvaluatorReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;

      // Get the latest DailySkillReport with evaluator data
      const report = await this.prisma.dailySkillReport.findFirst({
        where: { traineeId },
        orderBy: { date: 'desc' },
      });

      if (!report) {
        res.status(404).json({ error: 'No skill report found' });
        return;
      }

      // Get trainee's assigned teacher
      const trainee = await this.prisma.trainee.findUnique({
        where: { id: traineeId },
        select: { assignedTeacher: true, assignedTeacherAt: true },
      });

      const evaluatorStatus = report.evaluatorStatus || 'pending';

      if (evaluatorStatus !== 'completed' || !report.evaluatorReport) {
        res.status(200).json({
          evaluatorReport: null,
          evaluatorStatus,
          assignedTeacher: trainee?.assignedTeacher || null,
        });
        return;
      }

      let parsedReport = null;
      try {
        parsedReport = JSON.parse(report.evaluatorReport);
      } catch {
        parsedReport = null;
      }

      res.status(200).json({
        evaluatorReport: parsedReport,
        evaluatorStatus,
        assignedTeacher: trainee?.assignedTeacher || null,
      });
    } catch (error) {
      next(error);
    }
  }
}
