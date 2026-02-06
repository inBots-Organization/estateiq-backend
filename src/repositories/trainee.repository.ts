import { injectable, inject } from 'tsyringe';
import { PrismaClient, Trainee } from '@prisma/client';
import {
  ITraineeRepository,
  CreateTraineeData,
  UpdateTraineeData,
} from './interfaces/trainee.repository.interface';

@injectable()
export class TraineeRepository implements ITraineeRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async findById(id: string): Promise<Trainee | null> {
    return this.prisma.trainee.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<Trainee | null> {
    return this.prisma.trainee.findUnique({
      where: { email },
    });
  }

  async findByOrganization(organizationId: string): Promise<Trainee[]> {
    return this.prisma.trainee.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateTraineeData): Promise<Trainee> {
    return this.prisma.trainee.create({
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        organizationId: data.organizationId,
        passwordHash: data.passwordHash,
        role: data.role || 'trainee',
      },
    });
  }

  async update(id: string, data: UpdateTraineeData): Promise<Trainee> {
    return this.prisma.trainee.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.trainee.delete({
      where: { id },
    });
  }

  async getWithProgress(id: string) {
    return this.prisma.trainee.findUnique({
      where: { id },
      include: {
        completedLectures: {
          select: { lectureId: true },
        },
        completedAssessments: {
          select: { assessmentId: true },
        },
        simulationSessions: {
          where: { status: 'completed' },
          select: { id: true },
        },
      },
    });
  }
}
