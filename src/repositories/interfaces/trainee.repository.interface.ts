import { Trainee } from '@prisma/client';
import { TraineeStatus } from '../../types/enums';

export interface CreateTraineeData {
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  passwordHash: string;
  role?: 'trainee' | 'trainer' | 'org_admin';
}

export interface UpdateTraineeData {
  firstName?: string;
  lastName?: string;
  status?: TraineeStatus;
  currentLevelId?: string;
  totalTimeOnPlatform?: number;
  currentStreak?: number;
  lastActiveAt?: Date;
  passwordHash?: string;
  passwordChangedAt?: Date;
}

export interface ITraineeRepository {
  findById(id: string): Promise<Trainee | null>;
  findByEmail(email: string): Promise<Trainee | null>;
  findByOrganization(organizationId: string): Promise<Trainee[]>;
  create(data: CreateTraineeData): Promise<Trainee>;
  update(id: string, data: UpdateTraineeData): Promise<Trainee>;
  delete(id: string): Promise<void>;
  getWithProgress(id: string): Promise<Trainee & {
    completedLectures: { lectureId: string }[];
    completedAssessments: { assessmentId: string }[];
    simulationSessions: { id: string }[];
  } | null>;
}
