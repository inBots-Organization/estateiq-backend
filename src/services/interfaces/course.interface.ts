import { CourseDifficulty, CourseCategory } from '../../types/enums';

export interface CourseDetails {
  id: string;
  programId: string;
  levelId: string;
  title: string;
  description: string;
  objectives: string[];
  prerequisites: string[];
  estimatedDurationMinutes: number;
  difficulty: CourseDifficulty;
  category: CourseCategory;
  isPublished: boolean;
  orderInLevel: number;
  lectures: LectureDetails[];
}

export interface LectureDetails {
  id: string;
  courseId: string;
  title: string;
  description: string;
  videoUrl: string;
  durationMinutes: number;
  orderInCourse: number;
  triggerAssessmentOnComplete: boolean;
}

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  difficulty: CourseDifficulty;
  category: CourseCategory;
  estimatedDurationMinutes: number;
  lectureCount: number;
  isCompleted: boolean;
  progress: number;
}

export interface ICourseService {
  getAllCourses(): Promise<CourseListItem[]>;
  getCourseById(courseId: string): Promise<CourseDetails>;
  getCoursesByLevel(levelId: string): Promise<CourseListItem[]>;
  getCoursesByProgram(programId: string): Promise<CourseListItem[]>;
  getLectureById(lectureId: string): Promise<LectureDetails>;
  getTraineeCourseProgress(traineeId: string, courseId: string): Promise<number>;
  searchCourses(query: string, filters?: {
    difficulty?: CourseDifficulty;
    category?: CourseCategory;
  }): Promise<CourseListItem[]>;
}
