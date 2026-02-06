import { injectable, inject } from 'tsyringe';
import { PrismaClient, Course, Lecture } from '@prisma/client';
import { ICourseRepository, CourseWithLectures } from './interfaces/course.repository.interface';
import { CourseDifficulty, CourseCategory } from '../types/enums';

@injectable()
export class CourseRepository implements ICourseRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async findAll(): Promise<Course[]> {
    return this.prisma.course.findMany({
      where: {
        isPublished: true,
      },
      orderBy: { title: 'asc' },
    });
  }

  async findById(id: string): Promise<Course | null> {
    return this.prisma.course.findUnique({
      where: { id },
    });
  }

  async findByIdWithLectures(id: string): Promise<CourseWithLectures | null> {
    return this.prisma.course.findUnique({
      where: { id },
      include: {
        lectures: {
          orderBy: { orderInCourse: 'asc' },
        },
      },
    });
  }

  async findByLevel(levelId: string): Promise<Course[]> {
    return this.prisma.course.findMany({
      where: {
        levelId,
        isPublished: true,
      },
      orderBy: { orderInLevel: 'asc' },
    });
  }

  async findByProgram(programId: string): Promise<Course[]> {
    return this.prisma.course.findMany({
      where: {
        programId,
        isPublished: true,
      },
      orderBy: { orderInLevel: 'asc' },
    });
  }

  async findLectureById(lectureId: string): Promise<Lecture | null> {
    return this.prisma.lecture.findUnique({
      where: { id: lectureId },
    });
  }

  async findLecturesByCourse(courseId: string): Promise<Lecture[]> {
    return this.prisma.lecture.findMany({
      where: { courseId },
      orderBy: { orderInCourse: 'asc' },
    });
  }

  async search(query: string, filters?: {
    difficulty?: CourseDifficulty;
    category?: CourseCategory;
  }): Promise<Course[]> {
    return this.prisma.course.findMany({
      where: {
        isPublished: true,
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
        ...(filters?.difficulty && { difficulty: filters.difficulty }),
        ...(filters?.category && { category: filters.category }),
      },
      orderBy: { title: 'asc' },
    });
  }

  async getTraineeCompletedLectures(traineeId: string, courseId: string): Promise<string[]> {
    const completions = await this.prisma.lectureCompletion.findMany({
      where: {
        traineeId,
        lecture: { courseId },
      },
      select: { lectureId: true },
    });

    return completions.map(c => c.lectureId);
  }
}
