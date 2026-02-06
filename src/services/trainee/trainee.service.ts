import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { ITraineeRepository } from '../../repositories/interfaces/trainee.repository.interface';
import { TraineeStatus } from '../../types/enums';
import {
  ITraineeService,
  TraineeProfile,
  TraineeProgress,
  UpdateTraineeInput,
  DashboardStats,
} from '../interfaces/trainee.interface';

@injectable()
export class TraineeService implements ITraineeService {
  constructor(
    @inject('TraineeRepository') private traineeRepository: ITraineeRepository,
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  async getProfile(traineeId: string): Promise<TraineeProfile> {
    const trainee = await this.traineeRepository.getWithProgress(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    return {
      id: trainee.id,
      email: trainee.email,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
      organizationId: trainee.organizationId,
      currentLevelId: trainee.currentLevelId,
      status: trainee.status as TraineeStatus,
      metrics: {
        totalTimeOnPlatform: trainee.totalTimeOnPlatform,
        currentStreak: trainee.currentStreak,
        lastActiveAt: trainee.lastActiveAt,
      },
      progress: {
        completedLectureIds: trainee.completedLectures.map(l => l.lectureId),
        completedAssessmentIds: trainee.completedAssessments.map(a => a.assessmentId),
        completedSimulationIds: trainee.simulationSessions.map(s => s.id),
      },
    };
  }

  async updateProfile(traineeId: string, input: UpdateTraineeInput): Promise<TraineeProfile> {
    const trainee = await this.traineeRepository.findById(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    await this.traineeRepository.update(traineeId, input);

    return this.getProfile(traineeId);
  }

  async getProgress(traineeId: string, programId: string): Promise<TraineeProgress> {
    const trainee = await this.traineeRepository.getWithProgress(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const program = await this.prisma.program.findUnique({
      where: { id: programId },
      include: {
        levels: {
          include: {
            courses: {
              include: {
                lectures: true,
              },
            },
          },
        },
      },
    });

    if (!program) {
      throw new Error('Program not found');
    }

    const totalLectures = program.levels.reduce((sum, level) =>
      sum + level.courses.reduce((courseSum, course) =>
        courseSum + course.lectures.length, 0), 0);

    const completedLectureIds = new Set(trainee.completedLectures.map(l => l.lectureId));
    const programLectureIds = program.levels.flatMap(level =>
      level.courses.flatMap(course =>
        course.lectures.map(l => l.id)
      )
    );
    const completedInProgram = programLectureIds.filter(id => completedLectureIds.has(id)).length;

    const totalAssessments = program.levels.length;

    let currentLevel = null;
    if (trainee.currentLevelId) {
      const level = program.levels.find(l => l.id === trainee.currentLevelId);
      if (level) {
        const levelLectureIds = level.courses.flatMap(c => c.lectures.map(l => l.id));
        const levelCompleted = levelLectureIds.filter(id => completedLectureIds.has(id)).length;

        currentLevel = {
          id: level.id,
          title: level.title,
          progress: levelLectureIds.length > 0
            ? Math.round((levelCompleted / levelLectureIds.length) * 100)
            : 0,
        };
      }
    }

    return {
      traineeId,
      programId,
      lecturesCompleted: completedInProgram,
      lecturesTotal: totalLectures,
      assessmentsPassed: trainee.completedAssessments.length,
      assessmentsTotal: totalAssessments,
      simulationsCompleted: trainee.simulationSessions.length,
      currentLevel,
      overallProgress: totalLectures > 0
        ? Math.round((completedInProgram / totalLectures) * 100)
        : 0,
    };
  }

  async getDashboardStats(traineeId: string): Promise<DashboardStats> {
    const trainee = await this.prisma.trainee.findUnique({
      where: { id: traineeId },
      include: {
        completedLectures: {
          include: { lecture: { include: { course: true } } },
          orderBy: { completedAt: 'desc' },
        },
        completedAssessments: {
          orderBy: { completedAt: 'desc' },
        },
        simulationSessions: {
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
        },
        enrollments: {
          include: {
            program: {
              include: {
                levels: {
                  include: {
                    courses: {
                      include: { lectures: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!trainee) {
      throw new Error('Trainee not found');
    }

    // Get voice sessions
    const voiceSessions = await this.prisma.voiceSession.findMany({
      where: { traineeId },
      orderBy: { endTime: 'desc' },
    });

    // Calculate average score from simulations and voice sessions
    const allScores: number[] = [];

    // Scores from simulation sessions
    trainee.simulationSessions.forEach(session => {
      if (session.metrics) {
        try {
          const metrics = JSON.parse(session.metrics as string);
          if (metrics.aiEvaluatedScore) {
            allScores.push(metrics.aiEvaluatedScore);
          }
        } catch {}
      }
    });

    // Scores from voice sessions
    voiceSessions.forEach(session => {
      if (session.overallScore) {
        allScores.push(session.overallScore);
      }
    });

    // Scores from assessments
    trainee.completedAssessments.forEach(assessment => {
      allScores.push(assessment.score);
    });

    const averageScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

    // Calculate overall progress
    let totalLectures = 0;
    let completedLectureIds = new Set(trainee.completedLectures.map(l => l.lectureId));

    trainee.enrollments.forEach(enrollment => {
      enrollment.program.levels.forEach(level => {
        level.courses.forEach(course => {
          totalLectures += course.lectures.length;
        });
      });
    });

    const overallProgress = totalLectures > 0
      ? Math.round((completedLectureIds.size / totalLectures) * 100)
      : 0;

    // Count unique courses completed (all lectures in course done)
    const completedCourses = new Set<string>();
    trainee.enrollments.forEach(enrollment => {
      enrollment.program.levels.forEach(level => {
        level.courses.forEach(course => {
          const courseLectureIds = course.lectures.map(l => l.id);
          const allDone = courseLectureIds.every(id => completedLectureIds.has(id));
          if (allDone && courseLectureIds.length > 0) {
            completedCourses.add(course.id);
          }
        });
      });
    });

    // Get recent sessions (last 10)
    const recentSessions: DashboardStats['recentSessions'] = [];

    // Add simulation sessions
    trainee.simulationSessions.slice(0, 5).forEach(session => {
      let score: number | null = null;
      try {
        const metrics = JSON.parse(session.metrics as string || '{}');
        score = metrics.aiEvaluatedScore || null;
      } catch {}

      recentSessions.push({
        id: session.id,
        type: 'simulation',
        score,
        completedAt: session.completedAt || session.startedAt || new Date(),
        durationSeconds: session.durationSeconds || 0,
      });
    });

    // Add voice sessions
    voiceSessions.slice(0, 5).forEach(session => {
      recentSessions.push({
        id: session.id,
        type: 'voice',
        score: session.overallScore,
        completedAt: session.endTime,
        durationSeconds: session.durationSeconds,
      });
    });

    // Sort by date and take latest 10
    recentSessions.sort((a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );

    // Calculate weekly activity (last 7 days)
    const weeklyActivity: DashboardStats['weeklyActivity'] = [];
    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      let sessions = 0;
      let minutes = 0;

      // Count simulation sessions
      trainee.simulationSessions.forEach(session => {
        const completedAt = session.completedAt || session.startedAt;
        if (completedAt && completedAt >= date && completedAt < nextDate) {
          sessions++;
          minutes += Math.round((session.durationSeconds || 0) / 60);
        }
      });

      // Count voice sessions
      voiceSessions.forEach(session => {
        if (session.endTime >= date && session.endTime < nextDate) {
          sessions++;
          minutes += Math.round(session.durationSeconds / 60);
        }
      });

      // Count lecture completions
      trainee.completedLectures.forEach(lc => {
        if (lc.completedAt >= date && lc.completedAt < nextDate) {
          sessions++;
          minutes += lc.timeSpentMinutes;
        }
      });

      weeklyActivity.push({
        day: dayNames[date.getDay()],
        sessions,
        minutes,
      });
    }

    // Find current course (first incomplete course in enrolled programs)
    let currentCourse: DashboardStats['currentCourse'] = null;

    for (const enrollment of trainee.enrollments) {
      for (const level of enrollment.program.levels) {
        for (const course of level.courses) {
          const courseLectureIds = course.lectures.map(l => l.id);
          const completedCount = courseLectureIds.filter(id => completedLectureIds.has(id)).length;

          if (completedCount < courseLectureIds.length && courseLectureIds.length > 0) {
            // Find next lecture
            const sortedLectures = [...course.lectures].sort((a, b) => a.orderInCourse - b.orderInCourse);
            const nextLecture = sortedLectures.find(l => !completedLectureIds.has(l.id));

            currentCourse = {
              id: course.id,
              title: course.title,
              progress: Math.round((completedCount / courseLectureIds.length) * 100),
              nextLectureTitle: nextLecture?.title || null,
            };
            break;
          }
        }
        if (currentCourse) break;
      }
      if (currentCourse) break;
    }

    return {
      totalTimeOnPlatform: trainee.totalTimeOnPlatform,
      currentStreak: trainee.currentStreak,
      overallProgress,
      averageScore,
      simulationsCompleted: trainee.simulationSessions.length,
      coursesCompleted: completedCourses.size,
      voiceCallsCompleted: voiceSessions.length,
      lecturesCompleted: trainee.completedLectures.length,
      assessmentsPassed: trainee.completedAssessments.filter(a => a.score >= 70).length,
      recentSessions: recentSessions.slice(0, 10),
      weeklyActivity,
      currentCourse,
    };
  }

  async updateActivity(traineeId: string, timeSpentMinutes: number): Promise<void> {
    const trainee = await this.traineeRepository.findById(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const now = new Date();
    const lastActive = trainee.lastActiveAt;
    let newStreak = trainee.currentStreak;

    if (lastActive) {
      const daysSinceLastActive = Math.floor(
        (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastActive === 1) {
        newStreak += 1;
      } else if (daysSinceLastActive > 1) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    await this.traineeRepository.update(traineeId, {
      totalTimeOnPlatform: trainee.totalTimeOnPlatform + timeSpentMinutes,
      currentStreak: newStreak,
      lastActiveAt: now,
    });
  }

  async enrollInProgram(traineeId: string, programId: string): Promise<void> {
    const existing = await this.prisma.programEnrollment.findUnique({
      where: {
        traineeId_programId: {
          traineeId,
          programId,
        },
      },
    });

    if (existing) {
      throw new Error('Already enrolled in this program');
    }

    await this.prisma.programEnrollment.create({
      data: {
        traineeId,
        programId,
      },
    });

    const firstLevel = await this.prisma.level.findFirst({
      where: { programId },
      orderBy: { orderInProgram: 'asc' },
    });

    if (firstLevel) {
      await this.traineeRepository.update(traineeId, {
        currentLevelId: firstLevel.id,
      });
    }
  }

  async completeLecture(traineeId: string, lectureId: string, timeSpentMinutes: number): Promise<void> {
    const existing = await this.prisma.lectureCompletion.findUnique({
      where: {
        traineeId_lectureId: {
          traineeId,
          lectureId,
        },
      },
    });

    if (existing) {
      return;
    }

    await this.prisma.lectureCompletion.create({
      data: {
        traineeId,
        lectureId,
        timeSpentMinutes,
      },
    });

    await this.updateActivity(traineeId, timeSpentMinutes);
  }

  async completeAssessment(traineeId: string, assessmentId: string, score: number): Promise<void> {
    const existing = await this.prisma.assessmentCompletion.findUnique({
      where: {
        traineeId_assessmentId: {
          traineeId,
          assessmentId,
        },
      },
    });

    if (existing) {
      await this.prisma.assessmentCompletion.update({
        where: { id: existing.id },
        data: { score },
      });
      return;
    }

    await this.prisma.assessmentCompletion.create({
      data: {
        traineeId,
        assessmentId,
        score,
      },
    });
  }
}
