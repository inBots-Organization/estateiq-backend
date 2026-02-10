import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { IQuizService } from '../services/interfaces/quiz.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  CreateQuizSchema,
  UpdateQuizSchema,
  PublishQuizSchema,
  SubmitAttemptSchema,
  GenerateQuizSchema,
} from '../dtos/validation/quiz.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class QuizController {
  public router: Router;

  constructor(
    @inject('QuizService') private quizService: IQuizService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ==========================================
    // Trainee routes (must come before :quizId)
    // ==========================================

    // GET /api/quizzes/available — List published quizzes for trainee
    this.router.get(
      '/available',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAvailableQuizzes.bind(this)
    );

    // GET /api/quizzes/history — Trainee's attempt history
    this.router.get(
      '/history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getTraineeHistory.bind(this)
    );

    // GET /api/quizzes/attempts/:attemptId/result — View attempt result
    this.router.get(
      '/attempts/:attemptId/result',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAttemptResult.bind(this)
    );

    // POST /api/quizzes/attempts/:attemptId/submit — Submit attempt responses
    this.router.post(
      '/attempts/:attemptId/submit',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(SubmitAttemptSchema),
      this.submitAttempt.bind(this)
    );

    // ==========================================
    // Admin routes (must come before :quizId)
    // ==========================================

    // GET /api/quizzes/manage — List all quizzes (admin view with stats)
    this.router.get(
      '/manage',
      authMiddleware(['trainer', 'org_admin']),
      this.listQuizzesForAdmin.bind(this)
    );

    // POST /api/quizzes/generate — AI-generate quiz (trainees can generate for themselves)
    this.router.post(
      '/generate',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(GenerateQuizSchema),
      this.generateQuiz.bind(this)
    );

    // POST /api/quizzes — Create quiz with questions & options
    this.router.post(
      '/',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(CreateQuizSchema),
      this.createQuiz.bind(this)
    );

    // ==========================================
    // Parameterized :quizId routes
    // ==========================================

    // GET /api/quizzes/:quizId/take — Get quiz for taking (correct answers stripped)
    this.router.get(
      '/:quizId/take',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getQuizForTaking.bind(this)
    );

    // POST /api/quizzes/:quizId/start — Start a new attempt
    this.router.post(
      '/:quizId/start',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.startAttempt.bind(this)
    );

    // GET /api/quizzes/:quizId/admin — Full quiz detail with correct answers (admin)
    this.router.get(
      '/:quizId/admin',
      authMiddleware(['trainer', 'org_admin']),
      this.getQuizForAdmin.bind(this)
    );

    // GET /api/quizzes/:quizId/attempts — All attempts for a quiz (admin view)
    this.router.get(
      '/:quizId/attempts',
      authMiddleware(['trainer', 'org_admin']),
      this.getQuizAttempts.bind(this)
    );

    // PATCH /api/quizzes/:quizId/publish — Toggle publish status
    this.router.patch(
      '/:quizId/publish',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(PublishQuizSchema),
      this.publishQuiz.bind(this)
    );

    // PUT /api/quizzes/:quizId — Update quiz
    this.router.put(
      '/:quizId',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(UpdateQuizSchema),
      this.updateQuiz.bind(this)
    );

    // DELETE /api/quizzes/:quizId — Delete quiz
    this.router.delete(
      '/:quizId',
      authMiddleware(['trainer', 'org_admin']),
      this.deleteQuiz.bind(this)
    );
  }

  // ==========================================
  // Trainee handlers
  // ==========================================

  private async getAvailableQuizzes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courseId = req.query.courseId as string | undefined;
      const quizzes = await this.quizService.getAvailableQuizzes(courseId);
      res.status(200).json({ quizzes });
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const history = await this.quizService.getTraineeHistory(traineeId);
      res.status(200).json({ history });
    } catch (error) {
      next(error);
    }
  }

  private async getQuizForTaking(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const traineeId = req.user!.userId;
      const quiz = await this.quizService.getQuizForTaking(quizId, traineeId);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async startAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const traineeId = req.user!.userId;
      const result = await this.quizService.startAttempt(traineeId, quizId);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async submitAttempt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { attemptId } = req.params;
      const traineeId = req.user!.userId;
      const { responses } = req.body;
      const result = await this.quizService.submitAttempt(attemptId, traineeId, responses);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getAttemptResult(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { attemptId } = req.params;
      const traineeId = req.user!.userId;
      const result = await this.quizService.getAttemptResult(attemptId, traineeId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Admin handlers
  // ==========================================

  private async listQuizzesForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || null;
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      const quizzes = await this.quizService.listQuizzesForAdmin(orgId, userId, userRole);
      res.status(200).json({ quizzes });
    } catch (error) {
      next(error);
    }
  }

  private async createQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const quiz = await this.quizService.createQuiz(creatorId, orgId, req.body);
      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async getQuizForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const quiz = await this.quizService.getQuizForAdmin(quizId);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async updateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const quiz = await this.quizService.updateQuiz(quizId, req.body);
      res.status(200).json(quiz);
    } catch (error) {
      next(error);
    }
  }

  private async deleteQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      await this.quizService.deleteQuiz(quizId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private async publishQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const { publish } = req.body;
      await this.quizService.publishQuiz(quizId, publish);
      res.status(200).json({ message: publish ? 'Quiz published' : 'Quiz unpublished' });
    } catch (error) {
      next(error);
    }
  }

  private async getQuizAttempts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { quizId } = req.params;
      const attempts = await this.quizService.getQuizAttempts(quizId);
      res.status(200).json({ attempts });
    } catch (error) {
      next(error);
    }
  }

  private async generateQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const quiz = await this.quizService.generateQuiz(creatorId, orgId, req.body);
      res.status(201).json(quiz);
    } catch (error) {
      next(error);
    }
  }
}
