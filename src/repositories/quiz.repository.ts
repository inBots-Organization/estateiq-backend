import { injectable, inject } from 'tsyringe';
import { PrismaClient, Quiz, Question, QuestionOption, QuizAttempt, QuizResponse } from '@prisma/client';
import {
  IQuizRepository,
  QuizWithQuestions,
  QuizWithCount,
  AttemptWithTrainee,
  AttemptWithResponses,
  CreateQuizData,
  CreateQuestionData,
  CreateOptionData,
  CreateAttemptData,
  CreateResponseData,
} from './interfaces/quiz.repository.interface';

@injectable()
export class QuizRepository implements IQuizRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  // ---- Quiz CRUD ----

  async create(data: CreateQuizData): Promise<Quiz> {
    return this.prisma.quiz.create({ data });
  }

  async findById(id: string): Promise<Quiz | null> {
    return this.prisma.quiz.findUnique({ where: { id } });
  }

  async findByIdWithQuestions(id: string): Promise<QuizWithQuestions | null> {
    return this.prisma.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { orderInQuiz: 'asc' },
          include: {
            options: {
              orderBy: { orderInQuestion: 'asc' },
            },
          },
        },
      },
    });
  }

  async findByCourse(courseId: string, publishedOnly = false): Promise<QuizWithCount[]> {
    return this.prisma.quiz.findMany({
      where: {
        courseId,
        ...(publishedOnly ? { isPublished: true } : {}),
      },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrganization(orgId: string): Promise<QuizWithCount[]> {
    return this.prisma.quiz.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCreator(creatorId: string): Promise<QuizWithCount[]> {
    return this.prisma.quiz.findMany({
      where: { createdById: creatorId },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPublished(courseId?: string): Promise<QuizWithCount[]> {
    return this.prisma.quiz.findMany({
      where: {
        isPublished: true,
        ...(courseId ? { courseId } : {}),
      },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, data: Partial<CreateQuizData>): Promise<Quiz> {
    return this.prisma.quiz.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.quiz.delete({ where: { id } });
  }

  // ---- Questions ----

  async createQuestion(data: CreateQuestionData): Promise<Question> {
    return this.prisma.question.create({ data });
  }

  async deleteQuestionsByQuiz(quizId: string): Promise<void> {
    await this.prisma.question.deleteMany({ where: { quizId } });
  }

  // ---- Options ----

  async createOption(data: CreateOptionData): Promise<QuestionOption> {
    return this.prisma.questionOption.create({ data });
  }

  // ---- Attempts ----

  async createAttempt(data: CreateAttemptData): Promise<QuizAttempt> {
    return this.prisma.quizAttempt.create({ data });
  }

  async findAttemptById(id: string): Promise<QuizAttempt | null> {
    return this.prisma.quizAttempt.findUnique({ where: { id } });
  }

  async findAttemptByIdWithResponses(id: string): Promise<AttemptWithResponses | null> {
    return this.prisma.quizAttempt.findUnique({
      where: { id },
      include: {
        responses: {
          include: {
            question: {
              include: {
                options: { orderBy: { orderInQuestion: 'asc' } },
              },
            },
          },
        },
      },
    });
  }

  async findAttemptsByTrainee(
    traineeId: string,
    quizId?: string
  ): Promise<(QuizAttempt & { quiz: { title: string; titleAr: string | null; passingScore: number } })[]> {
    return this.prisma.quizAttempt.findMany({
      where: {
        traineeId,
        ...(quizId ? { quizId } : {}),
      },
      include: {
        quiz: {
          select: { title: true, titleAr: true, passingScore: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findAttemptsByQuiz(quizId: string): Promise<AttemptWithTrainee[]> {
    return this.prisma.quizAttempt.findMany({
      where: { quizId },
      include: {
        trainee: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async updateAttempt(id: string, data: Partial<QuizAttempt>): Promise<QuizAttempt> {
    const { id: _id, ...updateData } = data;
    return this.prisma.quizAttempt.update({
      where: { id },
      data: updateData,
    });
  }

  async countAttemptsByTraineeAndQuiz(traineeId: string, quizId: string): Promise<number> {
    return this.prisma.quizAttempt.count({
      where: { traineeId, quizId },
    });
  }

  // ---- Responses ----

  async createManyResponses(data: CreateResponseData[]): Promise<number> {
    const result = await this.prisma.quizResponse.createMany({ data });
    return result.count;
  }

  async findResponsesByAttempt(
    attemptId: string
  ): Promise<(QuizResponse & { question: Question & { options: QuestionOption[] } })[]> {
    return this.prisma.quizResponse.findMany({
      where: { attemptId },
      include: {
        question: {
          include: {
            options: { orderBy: { orderInQuestion: 'asc' } },
          },
        },
      },
    });
  }
}
