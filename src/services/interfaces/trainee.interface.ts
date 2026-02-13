import { TraineeStatus } from '../../types/enums';

export interface TraineeProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  currentLevelId: string | null;
  status: TraineeStatus;
  metrics: {
    totalTimeOnPlatform: number;
    currentStreak: number;
    lastActiveAt: Date | null;
  };
  progress: {
    completedLectureIds: string[];
    completedAssessmentIds: string[];
    completedSimulationIds: string[];
  };
}

export interface TraineeProgress {
  traineeId: string;
  programId: string;
  lecturesCompleted: number;
  lecturesTotal: number;
  assessmentsPassed: number;
  assessmentsTotal: number;
  simulationsCompleted: number;
  currentLevel: {
    id: string;
    title: string;
    progress: number;
  } | null;
  overallProgress: number;
}

export interface UpdateTraineeInput {
  firstName?: string;
  lastName?: string;
  status?: TraineeStatus;
}

export interface DashboardStats {
  // Core metrics
  totalTimeOnPlatform: number;
  currentStreak: number;
  overallProgress: number;
  averageScore: number;

  // Activity counts
  simulationsCompleted: number;
  coursesCompleted: number;
  voiceCallsCompleted: number;
  lecturesCompleted: number;
  assessmentsPassed: number;

  // Recent activity
  recentSessions: {
    id: string;
    type: 'simulation' | 'voice' | 'lecture';
    score: number | null;
    completedAt: Date;
    durationSeconds: number;
  }[];

  // Weekly progress
  weeklyActivity: {
    day: string;
    sessions: number;
    minutes: number;
  }[];

  // Current course info (if any)
  currentCourse: {
    id: string;
    title: string;
    progress: number;
    nextLectureTitle: string | null;
  } | null;
}

export interface AssignedTeacherInfo {
  hasAssignedTeacher: boolean;
  teacherName: string | null;
  teacherId: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  avatarUrl: string | null;
  voiceId: string | null;
  currentSkillLevel: string | null;
}

export interface ITraineeService {
  getProfile(traineeId: string): Promise<TraineeProfile>;
  updateProfile(traineeId: string, input: UpdateTraineeInput): Promise<TraineeProfile>;
  getProgress(traineeId: string, programId: string): Promise<TraineeProgress>;
  getDashboardStats(traineeId: string): Promise<DashboardStats>;
  getAssignedTeacher(traineeId: string): Promise<AssignedTeacherInfo>;
  updateActivity(traineeId: string, timeSpentMinutes: number): Promise<void>;
  enrollInProgram(traineeId: string, programId: string): Promise<void>;
  completeLecture(traineeId: string, lectureId: string, timeSpentMinutes: number): Promise<void>;
  completeAssessment(traineeId: string, assessmentId: string, score: number): Promise<void>;
}
