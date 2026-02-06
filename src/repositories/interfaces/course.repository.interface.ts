import { Course, Lecture } from '@prisma/client';
import { CourseDifficulty, CourseCategory } from '../../types/enums';

export interface CourseWithLectures extends Course {
  lectures: Lecture[];
}

export interface ICourseRepository {
  findAll(): Promise<Course[]>;
  findById(id: string): Promise<Course | null>;
  findByIdWithLectures(id: string): Promise<CourseWithLectures | null>;
  findByLevel(levelId: string): Promise<Course[]>;
  findByProgram(programId: string): Promise<Course[]>;
  findLectureById(lectureId: string): Promise<Lecture | null>;
  findLecturesByCourse(courseId: string): Promise<Lecture[]>;
  search(query: string, filters?: {
    difficulty?: CourseDifficulty;
    category?: CourseCategory;
  }): Promise<Course[]>;
  getTraineeCompletedLectures(traineeId: string, courseId: string): Promise<string[]>;
}
