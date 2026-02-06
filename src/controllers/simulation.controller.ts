import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { ISimulationService } from '../services/interfaces/simulation.interface';
import { ISimulationRepository } from '../repositories/interfaces/simulation.repository.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  StartSimulationInputSchema,
  SimulationMessageInputSchema,
  EndSimulationInputSchema,
} from '../dtos/validation/simulation.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class SimulationController {
  public router: Router;

  constructor(
    @inject('SimulationService') private simulationService: ISimulationService,
    @inject('SimulationRepository') private simulationRepository: ISimulationRepository
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // History endpoint - must be before /:sessionId to avoid conflict
    this.router.get(
      '/history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getHistory.bind(this)
    );

    this.router.post(
      '/start',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(StartSimulationInputSchema),
      this.startSimulation.bind(this)
    );

    this.router.post(
      '/:sessionId/message',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(SimulationMessageInputSchema),
      this.sendMessage.bind(this)
    );

    this.router.post(
      '/:sessionId/end',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(EndSimulationInputSchema),
      this.endSimulation.bind(this)
    );

    this.router.get(
      '/:sessionId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getSession.bind(this)
    );

    this.router.get(
      '/:sessionId/analysis',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAnalysis.bind(this)
    );
  }

  private async startSimulation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body;
      const traineeId = req.user!.userId;

      const result = await this.simulationService.startSimulation({
        ...input,
        traineeId,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { message, messageType } = req.body;
      const traineeId = req.user!.userId;

      const result = await this.simulationService.processMessage({
        sessionId,
        traineeId,
        message,
        messageType,
        timestamp: new Date(),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async endSimulation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { endReason } = req.body;
      const traineeId = req.user!.userId;

      const result = await this.simulationService.endSimulation({
        sessionId,
        traineeId,
        endReason: endReason || 'completed',
      });

      // Auto-analyze completed simulations to generate skill reports
      // Run in background to not delay the response
      if (result.status === 'completed') {
        this.simulationService.analyzeSimulation({
          sessionId,
          includeDetailedTranscriptAnalysis: false,
          compareToHistory: false,
          generateRecommendations: true,
        }).then(() => {
          console.log('[SimulationController] Auto-analysis completed for session:', sessionId);
        }).catch((err) => {
          console.error('[SimulationController] Auto-analysis failed for session:', sessionId, err);
        });
      }

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await this.simulationService.getSessionById(sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.status(200).json(session);
    } catch (error) {
      next(error);
    }
  }

  private async getAnalysis(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { includeDetailedTranscriptAnalysis, compareToHistory } = req.query;

      const result = await this.simulationService.analyzeSimulation({
        sessionId,
        includeDetailedTranscriptAnalysis: includeDetailedTranscriptAnalysis === 'true',
        compareToHistory: compareToHistory === 'true',
        generateRecommendations: true,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      console.log('[SimulationController] Getting history for traineeId:', traineeId);

      const sessions = await this.simulationRepository.findByTrainee(traineeId, limit);

      console.log('[SimulationController] Found', sessions.length, 'sessions');

      // Return sessions with basic info (without full conversation turns for performance)
      const sessionsWithBasicInfo = sessions.map(session => ({
        id: session.id,
        traineeId: session.traineeId,
        scenarioType: session.scenarioType,
        difficultyLevel: session.difficultyLevel,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        durationSeconds: session.durationSeconds,
        outcome: session.outcome,
        metrics: session.metrics,
        conversationTurns: [], // Empty - fetch separately when needed
      }));

      res.status(200).json({ sessions: sessionsWithBasicInfo });
    } catch (error) {
      next(error);
    }
  }
}
