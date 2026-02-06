import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import {
  IAdminService,
  AdminOverviewStats,
  TeamPerformance,
  MonthlyTrend,
  AdminDashboardData,
  EmployeeListItem,
  EmployeeDetail,
  TrainerScope,
  AdminQueryOptions,
} from '../interfaces/admin.interface';

@injectable()
export class AdminService implements IAdminService {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  /**
   * Get trainee IDs for a trainer's assigned groups
   * This is the core method for trainer scoping
   */
  async getTrainerTraineeIds(trainerId: string, organizationId: string): Promise<string[]> {
    // Get groups where this trainer is assigned
    const trainerAssignments = await this.prisma.trainerGroupAssignment.findMany({
      where: { trainerId },
      select: { groupId: true },
    });

    const groupIds = trainerAssignments.map(a => a.groupId);

    if (groupIds.length === 0) {
      return [];
    }

    // Get all trainees in these groups
    const groupMembers = await this.prisma.groupMember.findMany({
      where: {
        groupId: { in: groupIds },
        trainee: { organizationId }, // Ensure same organization
      },
      select: { traineeId: true },
    });

    // Return unique trainee IDs
    return [...new Set(groupMembers.map(m => m.traineeId))];
  }

  async getOverviewStats(organizationId: string, trainerScope?: TrainerScope): Promise<AdminOverviewStats> {
    // If trainer scope is provided, only get trainees in trainer's groups
    let userIds: string[];

    if (trainerScope) {
      userIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (userIds.length === 0) {
        return {
          totalUsers: 0,
          activeUsers: 0,
          totalSessions: 0,
          completedSessions: 0,
          averageScore: 0,
          averageSessionsPerUser: 0,
        };
      }
    } else {
      // Get all users in organization
      const users = await this.prisma.trainee.findMany({
        where: { organizationId, status: 'active' },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    }

    // Get users with their activity
    const users = await this.prisma.trainee.findMany({
      where: { id: { in: userIds }, status: 'active' },
      select: { id: true, lastActiveAt: true },
    });

    const totalUsers = users.length;

    // Active users (active in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsers = users.filter(u => u.lastActiveAt && u.lastActiveAt > thirtyDaysAgo).length;

    // Get all sessions for these users
    const sessions = await this.prisma.simulationSession.findMany({
      where: { traineeId: { in: userIds } },
      select: {
        id: true,
        status: true,
        metrics: true,
      },
    });

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;

    // Calculate average score from completed sessions
    let totalScore = 0;
    let scoredSessions = 0;

    for (const session of sessions) {
      if (session.status === 'completed' && session.metrics) {
        try {
          const metrics = typeof session.metrics === 'string'
            ? JSON.parse(session.metrics)
            : session.metrics;
          const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
          if (typeof score === 'number') {
            totalScore += score;
            scoredSessions++;
          }
        } catch {
          // Skip invalid metrics
        }
      }
    }

    const averageScore = scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 0;
    const averageSessionsPerUser = totalUsers > 0 ? Math.round((totalSessions / totalUsers) * 10) / 10 : 0;

    return {
      totalUsers,
      activeUsers,
      totalSessions,
      completedSessions,
      averageScore,
      averageSessionsPerUser,
    };
  }

  async getTeamPerformance(organizationId: string, trainerScope?: TrainerScope): Promise<TeamPerformance> {
    // If trainer scope is provided, only get trainees in trainer's groups
    let userFilter: { organizationId: string; status: string; id?: { in: string[] } } = {
      organizationId,
      status: 'active',
    };

    if (trainerScope) {
      const traineeIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (traineeIds.length === 0) {
        return {
          bestPerformer: null,
          worstPerformer: null,
          averageTeamScore: 0,
        };
      }
      userFilter.id = { in: traineeIds };
    }

    // Get all users with their sessions
    const users = await this.prisma.trainee.findMany({
      where: userFilter,
      include: {
        simulationSessions: {
          where: { status: 'completed' },
          select: { metrics: true },
        },
      },
    });

    interface UserPerformance {
      id: string;
      name: string;
      email: string;
      averageScore: number;
      totalSessions: number;
    }

    const userPerformances: UserPerformance[] = [];

    for (const user of users) {
      let totalScore = 0;
      let scoredSessions = 0;

      for (const session of user.simulationSessions) {
        if (session.metrics) {
          try {
            const metrics = typeof session.metrics === 'string'
              ? JSON.parse(session.metrics)
              : session.metrics;
            const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
            if (typeof score === 'number') {
              totalScore += score;
              scoredSessions++;
            }
          } catch {
            // Skip invalid metrics
          }
        }
      }

      if (scoredSessions > 0) {
        userPerformances.push({
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          averageScore: Math.round(totalScore / scoredSessions),
          totalSessions: user.simulationSessions.length,
        });
      }
    }

    // Sort by average score
    userPerformances.sort((a, b) => b.averageScore - a.averageScore);

    const bestPerformer = userPerformances.length > 0 ? userPerformances[0] : null;
    const worstPerformer = userPerformances.length > 0
      ? userPerformances[userPerformances.length - 1]
      : null;

    const averageTeamScore = userPerformances.length > 0
      ? Math.round(userPerformances.reduce((sum, u) => sum + u.averageScore, 0) / userPerformances.length)
      : 0;

    return {
      bestPerformer,
      worstPerformer,
      averageTeamScore,
    };
  }

  async getMonthlyTrends(organizationId: string, months = 6, trainerScope?: TrainerScope): Promise<MonthlyTrend[]> {
    let userIds: string[];

    if (trainerScope) {
      userIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (userIds.length === 0) {
        return [];
      }
    } else {
      userIds = await this.prisma.trainee.findMany({
        where: { organizationId },
        select: { id: true },
      }).then(users => users.map(u => u.id));
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const sessions = await this.prisma.simulationSession.findMany({
      where: {
        traineeId: { in: userIds },
        completedAt: { gte: startDate },
        status: 'completed',
      },
      select: {
        traineeId: true,
        completedAt: true,
        metrics: true,
      },
    });

    // Group by month
    const monthlyData: Map<string, { scores: number[]; sessions: number; users: Set<string> }> = new Map();

    for (const session of sessions) {
      if (!session.completedAt) continue;

      const monthKey = `${session.completedAt.getFullYear()}-${String(session.completedAt.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { scores: [], sessions: 0, users: new Set() });
      }

      const data = monthlyData.get(monthKey)!;
      data.sessions++;
      data.users.add(session.traineeId);

      if (session.metrics) {
        try {
          const metrics = typeof session.metrics === 'string'
            ? JSON.parse(session.metrics)
            : session.metrics;
          const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
          if (typeof score === 'number') {
            data.scores.push(score);
          }
        } catch {
          // Skip invalid metrics
        }
      }
    }

    // Convert to array and sort
    const trends: MonthlyTrend[] = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (const [key, data] of monthlyData) {
      const [year, month] = key.split('-').map(Number);
      trends.push({
        month: monthNames[month - 1],
        year,
        averageScore: data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : 0,
        totalSessions: data.sessions,
        activeUsers: data.users.size,
      });
    }

    // Sort by date
    trends.sort((a, b) => {
      const monthIndexA = monthNames.indexOf(a.month);
      const monthIndexB = monthNames.indexOf(b.month);
      return a.year !== b.year ? a.year - b.year : monthIndexA - monthIndexB;
    });

    return trends;
  }

  async getDashboardData(organizationId: string, trainerScope?: TrainerScope): Promise<AdminDashboardData> {
    const [overview, teamPerformance, monthlyTrends] = await Promise.all([
      this.getOverviewStats(organizationId, trainerScope),
      this.getTeamPerformance(organizationId, trainerScope),
      this.getMonthlyTrends(organizationId, 6, trainerScope),
    ]);

    // Get recent activity - scoped by trainer if applicable
    let userFilter: { organizationId: string; id?: { in: string[] } } = { organizationId };

    if (trainerScope) {
      const traineeIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (traineeIds.length === 0) {
        return {
          overview,
          teamPerformance,
          monthlyTrends,
          recentActivity: [],
        };
      }
      userFilter.id = { in: traineeIds };
    }

    const userIds = await this.prisma.trainee.findMany({
      where: userFilter,
      select: { id: true, firstName: true, lastName: true },
    });

    const userMap = new Map(userIds.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const recentSessions = await this.prisma.simulationSession.findMany({
      where: { traineeId: { in: Array.from(userMap.keys()) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        traineeId: true,
        scenarioType: true,
        status: true,
        createdAt: true,
        completedAt: true,
      },
    });

    const recentActivity = recentSessions.map(session => ({
      userId: session.traineeId,
      userName: userMap.get(session.traineeId) || 'Unknown User',
      action: session.status === 'completed' ? 'Completed simulation' : 'Started simulation',
      timestamp: session.completedAt || session.createdAt,
      details: `${session.scenarioType.replace(/_/g, ' ')} simulation`,
    }));

    return {
      overview,
      teamPerformance,
      monthlyTrends,
      recentActivity,
    };
  }

  async getEmployeeList(
    organizationId: string,
    options: AdminQueryOptions = {}
  ): Promise<{ employees: EmployeeListItem[]; total: number; page: number; totalPages: number }> {
    const { page = 1, limit = 20, sortBy = 'lastName', sortOrder = 'asc', search, trainerScope } = options;

    // Build where clause with optional trainer scope
    const where: {
      organizationId: string;
      id?: { in: string[] };
      OR?: Array<{ firstName?: { contains: string }; lastName?: { contains: string }; email?: { contains: string } }>;
      // Exclude trainers and admins for trainer view - they should only see trainees
      role?: string;
    } = {
      organizationId,
    };

    // If trainer scope, limit to trainees in trainer's groups and only show trainees (not other trainers/admins)
    if (trainerScope) {
      const traineeIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (traineeIds.length === 0) {
        return { employees: [], total: 0, page, totalPages: 0 };
      }
      where.id = { in: traineeIds };
      where.role = 'trainee'; // Trainers can only see trainees, not other trainers or admins
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.trainee.findMany({
        where,
        include: {
          simulationSessions: {
            select: {
              id: true,
              status: true,
              metrics: true,
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.trainee.count({ where }),
    ]);

    const employees: EmployeeListItem[] = users.map(user => {
      const completedSessions = user.simulationSessions.filter(s => s.status === 'completed');
      let totalScore = 0;
      let scoredCount = 0;

      for (const session of completedSessions) {
        if (session.metrics) {
          try {
            const metrics = typeof session.metrics === 'string'
              ? JSON.parse(session.metrics)
              : session.metrics;
            const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
            if (typeof score === 'number') {
              totalScore += score;
              scoredCount++;
            }
          } catch {
            // Skip invalid metrics
          }
        }
      }

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: (user as { role?: string }).role || 'user',
        totalSessions: user.simulationSessions.length,
        completedSessions: completedSessions.length,
        averageScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
        lastActivityAt: user.lastActiveAt,
        createdAt: user.createdAt,
        status: user.status,
      };
    });

    return {
      employees,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEmployeeDetail(employeeId: string, organizationId: string, trainerScope?: TrainerScope): Promise<EmployeeDetail> {
    // If trainer scope is provided, verify the employee is in trainer's groups
    if (trainerScope) {
      const traineeIds = await this.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (!traineeIds.includes(employeeId)) {
        throw new Error('Access denied: Employee not in your assigned groups');
      }
    }

    const user = await this.prisma.trainee.findFirst({
      where: { id: employeeId, organizationId },
      include: {
        simulationSessions: {
          include: {
            interactionReport: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new Error('Employee not found');
    }

    const completedSessions = user.simulationSessions.filter(s => s.status === 'completed');

    // Calculate average score
    let totalScore = 0;
    let scoredCount = 0;
    const scoreHistory: { date: Date; score: number; sessionId: string }[] = [];
    const skillScores: Map<string, { total: number; count: number }> = new Map();

    for (const session of completedSessions) {
      if (session.metrics) {
        try {
          const metrics = typeof session.metrics === 'string'
            ? JSON.parse(session.metrics)
            : session.metrics;

          const score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore;
          if (typeof score === 'number') {
            totalScore += score;
            scoredCount++;

            if (session.completedAt) {
              scoreHistory.push({
                date: session.completedAt,
                score,
                sessionId: session.id,
              });
            }
          }
        } catch {
          // Skip invalid metrics
        }
      }

      // Extract skill scores from interaction report
      if (session.interactionReport) {
        try {
          const summary = typeof session.interactionReport.summary === 'string'
            ? JSON.parse(session.interactionReport.summary)
            : session.interactionReport.summary;

          // Assuming skill scores are stored in the summary
          if (summary && typeof summary === 'object') {
            const skills = ['communication', 'negotiation', 'objectionHandling', 'relationshipBuilding', 'productKnowledge', 'closingTechnique'];
            for (const skill of skills) {
              // Try to find skill score in various places it might be stored
              const skillScore = summary[skill] || summary.skillScores?.[skill]?.score;
              if (typeof skillScore === 'number') {
                if (!skillScores.has(skill)) {
                  skillScores.set(skill, { total: 0, count: 0 });
                }
                const data = skillScores.get(skill)!;
                data.total += skillScore;
                data.count++;
              }
            }
          }
        } catch {
          // Skip invalid summary
        }
      }
    }

    // Build skill breakdown
    const skillBreakdown = Array.from(skillScores.entries()).map(([skill, data]) => ({
      skill: this.formatSkillName(skill),
      averageScore: Math.round(data.total / data.count),
      sessionCount: data.count,
    }));

    // Find weak skills (below 60 average)
    const weakSkills = skillBreakdown
      .filter(s => s.averageScore < 60)
      .map(s => s.skill);

    // Generate recommendations
    const recommendations = this.generateRecommendations(weakSkills, scoredCount);

    // Format sessions
    const sessions = user.simulationSessions.map(session => {
      let score: number | null = null;
      let grade: string | null = null;

      if (session.metrics) {
        try {
          const metrics = typeof session.metrics === 'string'
            ? JSON.parse(session.metrics)
            : session.metrics;
          score = metrics.aiEvaluatedScore ?? metrics.preliminaryScore ?? null;
          grade = metrics.aiGrade ?? null;
        } catch {
          // Skip invalid metrics
        }
      }

      return {
        id: session.id,
        scenarioType: session.scenarioType,
        difficultyLevel: session.difficultyLevel,
        status: session.status,
        score,
        grade,
        completedAt: session.completedAt,
        durationSeconds: session.durationSeconds,
      };
    });

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: (user as { role?: string }).role || 'user',
      totalSessions: user.simulationSessions.length,
      completedSessions: completedSessions.length,
      averageScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : null,
      lastActivityAt: user.lastActiveAt,
      createdAt: user.createdAt,
      status: user.status,
      sessions,
      scoreHistory: scoreHistory.sort((a, b) => a.date.getTime() - b.date.getTime()),
      skillBreakdown,
      weakSkills,
      recommendations,
    };
  }

  async updateEmployeeRole(employeeId: string, role: 'user' | 'admin', adminId: string): Promise<void> {
    // Verify the employee exists
    const employee = await this.prisma.trainee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Prevent admin from removing their own admin role
    if (employeeId === adminId && role !== 'admin') {
      throw new Error('Cannot remove your own admin privileges');
    }

    await this.prisma.trainee.update({
      where: { id: employeeId },
      data: { role },
    });
  }

  private formatSkillName(skill: string): string {
    const names: Record<string, string> = {
      communication: 'Communication',
      negotiation: 'Negotiation',
      objectionHandling: 'Objection Handling',
      relationshipBuilding: 'Relationship Building',
      productKnowledge: 'Product Knowledge',
      closingTechnique: 'Closing Technique',
    };
    return names[skill] || skill;
  }

  private generateRecommendations(weakSkills: string[], sessionCount: number): string[] {
    const recommendations: string[] = [];

    if (sessionCount < 3) {
      recommendations.push('Complete more practice sessions to establish a performance baseline');
    }

    if (weakSkills.includes('Communication')) {
      recommendations.push('Focus on active listening and clear articulation in conversations');
    }

    if (weakSkills.includes('Objection Handling')) {
      recommendations.push('Practice the LAER method for handling objections effectively');
    }

    if (weakSkills.includes('Closing Technique')) {
      recommendations.push('Work on recognizing buying signals and using trial closes');
    }

    if (weakSkills.includes('Relationship Building')) {
      recommendations.push('Emphasize rapport-building techniques at the start of interactions');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue practicing to maintain and improve current skill levels');
    }

    return recommendations;
  }
}
