import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { ICourseService } from '../services/interfaces/course.interface';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';

@injectable()
export class CourseController {
  public router: Router;

  constructor(
    @inject('CourseService') private courseService: ICourseService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get all courses - must be before /:courseId to avoid matching 'search', 'program', 'level'
    this.router.get(
      '/',
      optionalAuthMiddleware(),
      this.getAllCourses.bind(this)
    );

    this.router.get(
      '/search',
      optionalAuthMiddleware(),
      this.searchCourses.bind(this)
    );

    this.router.get(
      '/program/:programId',
      optionalAuthMiddleware(),
      this.getCoursesByProgram.bind(this)
    );

    this.router.get(
      '/level/:levelId',
      optionalAuthMiddleware(),
      this.getCoursesByLevel.bind(this)
    );

    this.router.get(
      '/lectures/:lectureId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getLectureById.bind(this)
    );

    this.router.get(
      '/:courseId',
      optionalAuthMiddleware(),
      this.getCourseById.bind(this)
    );

    this.router.get(
      '/:courseId/progress',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getCourseProgress.bind(this)
    );
  }

  private async getAllCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const courses = await this.courseService.getAllCourses();
      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async searchCourses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, difficulty, category } = req.query;

      const courses = await this.courseService.searchCourses(
        (q as string) || '',
        {
          difficulty: difficulty as any,
          category: category as any,
        }
      );

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCoursesByProgram(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { programId } = req.params;

      const courses = await this.courseService.getCoursesByProgram(programId);

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCoursesByLevel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { levelId } = req.params;

      const courses = await this.courseService.getCoursesByLevel(levelId);

      res.status(200).json(courses);
    } catch (error) {
      next(error);
    }
  }

  private async getCourseById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseId } = req.params;

      const course = await this.courseService.getCourseById(courseId);

      res.status(200).json(course);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async getCourseProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { courseId } = req.params;
      const traineeId = req.user!.userId;

      const progress = await this.courseService.getTraineeCourseProgress(traineeId, courseId);

      res.status(200).json({ courseId, progress });
    } catch (error) {
      next(error);
    }
  }

  private async getLectureById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lectureId } = req.params;

      const lecture = await this.courseService.getLectureById(lectureId);

      res.status(200).json(lecture);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
}
