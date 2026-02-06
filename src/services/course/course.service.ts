import { injectable, inject } from 'tsyringe';
import { CourseDifficulty, CourseCategory } from '../../types/enums';
import { ICourseRepository } from '../../repositories/interfaces/course.repository.interface';
import { ITraineeRepository } from '../../repositories/interfaces/trainee.repository.interface';
import {
  ICourseService,
  CourseDetails,
  LectureDetails,
  CourseListItem,
} from '../interfaces/course.interface';

@injectable()
export class CourseService implements ICourseService {
  constructor(
    @inject('CourseRepository') private courseRepository: ICourseRepository,
    @inject('TraineeRepository') private traineeRepository: ITraineeRepository
  ) {}

  private parseJsonArray(value: string | string[]): string[] {
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  async getAllCourses(): Promise<CourseListItem[]> {
    const courses = await this.courseRepository.findAll();

    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty as CourseDifficulty,
      category: course.category as CourseCategory,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      lectureCount: 0,
      isCompleted: false,
      progress: 0,
    }));
  }

  async getCourseById(courseId: string): Promise<CourseDetails> {
    const course = await this.courseRepository.findByIdWithLectures(courseId);
    if (!course) {
      throw new Error('Course not found');
    }

    return {
      id: course.id,
      programId: course.programId,
      levelId: course.levelId,
      title: course.title,
      description: course.description,
      objectives: this.parseJsonArray(course.objectives),
      prerequisites: this.parseJsonArray(course.prerequisites),
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      difficulty: course.difficulty as CourseDifficulty,
      category: course.category as CourseCategory,
      isPublished: course.isPublished,
      orderInLevel: course.orderInLevel,
      lectures: course.lectures.map(l => ({
        id: l.id,
        courseId: l.courseId,
        title: l.title,
        description: l.description,
        videoUrl: l.videoUrl,
        durationMinutes: l.durationMinutes,
        orderInCourse: l.orderInCourse,
        triggerAssessmentOnComplete: l.triggerAssessmentOnComplete,
      })),
    };
  }

  async getCoursesByLevel(levelId: string): Promise<CourseListItem[]> {
    const courses = await this.courseRepository.findByLevel(levelId);

    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty as CourseDifficulty,
      category: course.category as CourseCategory,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      lectureCount: 0,
      isCompleted: false,
      progress: 0,
    }));
  }

  async getCoursesByProgram(programId: string): Promise<CourseListItem[]> {
    const courses = await this.courseRepository.findByProgram(programId);

    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty as CourseDifficulty,
      category: course.category as CourseCategory,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      lectureCount: 0,
      isCompleted: false,
      progress: 0,
    }));
  }

  async getLectureById(lectureId: string): Promise<LectureDetails> {
    const lecture = await this.courseRepository.findLectureById(lectureId);
    if (!lecture) {
      throw new Error('Lecture not found');
    }

    return {
      id: lecture.id,
      courseId: lecture.courseId,
      title: lecture.title,
      description: lecture.description,
      videoUrl: lecture.videoUrl,
      durationMinutes: lecture.durationMinutes,
      orderInCourse: lecture.orderInCourse,
      triggerAssessmentOnComplete: lecture.triggerAssessmentOnComplete,
    };
  }

  async getTraineeCourseProgress(traineeId: string, courseId: string): Promise<number> {
    const course = await this.courseRepository.findByIdWithLectures(courseId);
    if (!course) {
      throw new Error('Course not found');
    }

    if (course.lectures.length === 0) {
      return 100;
    }

    const completedLectureIds = await this.courseRepository.getTraineeCompletedLectures(
      traineeId,
      courseId
    );

    return Math.round((completedLectureIds.length / course.lectures.length) * 100);
  }

  async searchCourses(
    query: string,
    filters?: {
      difficulty?: CourseDifficulty;
      category?: CourseCategory;
    }
  ): Promise<CourseListItem[]> {
    const courses = await this.courseRepository.search(query, filters);

    return courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      difficulty: course.difficulty as CourseDifficulty,
      category: course.category as CourseCategory,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      lectureCount: 0,
      isCompleted: false,
      progress: 0,
    }));
  }
}
