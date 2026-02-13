import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { ITraineeService } from '../services/interfaces/trainee.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  UpdateTraineeSchema,
  EnrollProgramSchema,
  CompleteLectureSchema,
  CompleteAssessmentSchema,
  UpdateActivitySchema,
} from '../dtos/validation/trainee.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class TraineeController {
  public router: Router;

  constructor(
    @inject('TraineeService') private traineeService: ITraineeService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get(
      '/me',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getProfile.bind(this)
    );

    this.router.patch(
      '/me',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(UpdateTraineeSchema),
      this.updateProfile.bind(this)
    );

    this.router.get(
      '/me/progress/:programId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getProgress.bind(this)
    );

    this.router.get(
      '/me/dashboard-stats',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getDashboardStats.bind(this)
    );

    this.router.post(
      '/me/enroll',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(EnrollProgramSchema),
      this.enrollInProgram.bind(this)
    );

    this.router.post(
      '/me/complete-lecture',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(CompleteLectureSchema),
      this.completeLecture.bind(this)
    );

    this.router.post(
      '/me/complete-assessment',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(CompleteAssessmentSchema),
      this.completeAssessment.bind(this)
    );

    this.router.post(
      '/me/activity',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(UpdateActivitySchema),
      this.updateActivity.bind(this)
    );

    // Get current assigned AI teacher with full details
    this.router.get(
      '/me/assigned-teacher',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAssignedTeacher.bind(this)
    );

    // Admin routes
    this.router.get(
      '/:traineeId',
      authMiddleware(['trainer', 'org_admin']),
      this.getTraineeById.bind(this)
    );
  }

  private async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;

      const profile = await this.traineeService.getProfile(traineeId);

      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  private async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const input = req.body;

      const profile = await this.traineeService.updateProfile(traineeId, input);

      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  private async getProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { programId } = req.params;

      const progress = await this.traineeService.getProgress(traineeId, programId);

      res.status(200).json(progress);
    } catch (error) {
      next(error);
    }
  }

  private async getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;

      const stats = await this.traineeService.getDashboardStats(traineeId);

      res.status(200).json(stats);
    } catch (error) {
      next(error);
    }
  }

  private async enrollInProgram(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { programId } = req.body;

      await this.traineeService.enrollInProgram(traineeId, programId);

      res.status(201).json({ message: 'Enrolled successfully' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Already enrolled')) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async completeLecture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { lectureId, timeSpentMinutes } = req.body;

      await this.traineeService.completeLecture(traineeId, lectureId, timeSpentMinutes);

      res.status(200).json({ message: 'Lecture completed' });
    } catch (error) {
      next(error);
    }
  }

  private async completeAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { assessmentId, score } = req.body;

      await this.traineeService.completeAssessment(traineeId, assessmentId, score);

      res.status(200).json({ message: 'Assessment completed', passed: score >= 70 });
    } catch (error) {
      next(error);
    }
  }

  private async updateActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { timeSpentMinutes } = req.body;

      await this.traineeService.updateActivity(traineeId, timeSpentMinutes);

      res.status(200).json({ message: 'Activity updated' });
    } catch (error) {
      next(error);
    }
  }

  private async getTraineeById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { traineeId } = req.params;

      const profile = await this.traineeService.getProfile(traineeId);

      res.status(200).json(profile);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  /**
   * Get the current assigned AI teacher for the trainee with full details
   * Returns teacher info directly from the database (not cached localStorage)
   */
  private async getAssignedTeacher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;

      const teacherInfo = await this.traineeService.getAssignedTeacher(traineeId);

      res.status(200).json(teacherInfo);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
}
