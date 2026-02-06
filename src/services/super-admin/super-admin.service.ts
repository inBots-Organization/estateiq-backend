import { injectable } from 'tsyringe';
import { PrismaClient, Organization, SubscriptionPlan, Subscription } from '@prisma/client';
import jwt from 'jsonwebtoken';
import {
  ISuperAdminService,
  PaginationOptions,
  PaginatedResult,
  PlatformOverview,
  OrganizationSummary,
  OrganizationDetails,
  CreateOrgInput,
  UpdateOrgStatusInput,
  CreatePlanInput,
  UpdatePlanInput,
  AssignSubscriptionInput,
  UpdateSubscriptionInput,
  RevenueMetrics,
  ApiUsageMetrics,
  UserSummary,
  UserDetails,
  UserSearchOptions,
  ImpersonationToken,
  AuditLogEntry,
  AuditLogOptions,
  RecentActivity,
} from '../interfaces/super-admin.interface';

const prisma = new PrismaClient();

@injectable()
export class SuperAdminService implements ISuperAdminService {
  // ==========================================
  // Platform Overview
  // ==========================================

  async getPlatformOverview(): Promise<PlatformOverview> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get organization counts
    const [totalOrgs, activeOrgs, suspendedOrgs] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: 'active' } }),
      prisma.organization.count({ where: { status: 'suspended' } }),
    ]);

    // Get user counts
    const [totalUsers, activeUsers] = await Promise.all([
      prisma.trainee.count({ where: { role: { not: 'saas_super_admin' } } }),
      prisma.trainee.count({
        where: {
          role: { not: 'saas_super_admin' },
          lastActiveAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Get simulation and voice session counts
    const [totalSimulations, totalVoiceSessions] = await Promise.all([
      prisma.simulationSession.count(),
      prisma.voiceSession.count(),
    ]);

    // Calculate MRR from active subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'active' },
      include: { plan: true },
    });

    let mrr = 0;
    for (const sub of activeSubscriptions) {
      if (sub.billingCycle === 'monthly') {
        mrr += sub.plan.monthlyPrice;
      } else if (sub.billingCycle === 'annual' && sub.plan.annualPrice) {
        mrr += sub.plan.annualPrice / 12;
      }
    }

    // Get recent activity
    const recentActivity = await this.getRecentActivity(5);

    return {
      totalOrganizations: totalOrgs,
      activeOrganizations: activeOrgs,
      suspendedOrganizations: suspendedOrgs,
      totalUsers,
      activeUsersLast30Days: activeUsers,
      totalSimulations,
      totalVoiceSessions,
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      recentActivity,
    };
  }

  private async getRecentActivity(limit: number): Promise<RecentActivity[]> {
    // Get recent audit logs for activity
    const recentLogs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return recentLogs.map((log) => ({
      id: log.id,
      type: this.mapActionToActivityType(log.action),
      description: `${log.actorEmail} ${log.action.replace(/_/g, ' ')}`,
      targetId: log.targetId,
      targetName: log.targetType,
      createdAt: log.createdAt,
    }));
  }

  private mapActionToActivityType(action: string): RecentActivity['type'] {
    if (action.includes('suspend')) return 'org_suspended';
    if (action.includes('subscription')) return 'subscription_updated';
    if (action.includes('organization') && action.includes('post')) return 'org_created';
    return 'user_registered';
  }

  // ==========================================
  // Organization Management
  // ==========================================

  async getAllOrganizations(
    options: PaginationOptions & { status?: string; search?: string }
  ): Promise<PaginatedResult<OrganizationSummary>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', status, search } = options;

    const where: Record<string, unknown> = {
      name: { not: '__platform__' }, // Exclude platform org
    };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { contactEmail: { contains: search } },
      ];
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          trainees: {
            select: { id: true, lastActiveAt: true },
          },
          subscription: {
            include: { plan: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.organization.count({ where }),
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const data: OrganizationSummary[] = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      status: org.status,
      contactEmail: org.contactEmail,
      userCount: org.trainees.length,
      activeUserCount: org.trainees.filter((t) => t.lastActiveAt && t.lastActiveAt >= thirtyDaysAgo).length,
      subscriptionPlan: org.subscription?.plan.displayName || null,
      subscriptionStatus: org.subscription?.status || null,
      createdAt: org.createdAt,
      lastActivityAt: org.trainees.reduce((latest, t) => {
        if (!t.lastActiveAt) return latest;
        if (!latest) return t.lastActiveAt;
        return t.lastActiveAt > latest ? t.lastActiveAt : latest;
      }, null as Date | null),
    }));

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  async getOrganizationDetails(orgId: string): Promise<OrganizationDetails> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        trainees: true,
        groups: true,
        subscription: {
          include: { plan: true },
        },
      },
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get simulation and voice session counts
    const traineeIds = org.trainees.map((t) => t.id);

    const [totalSimulations, totalVoiceSessions, simulationsThisMonth, voiceSessionsThisMonth] = await Promise.all([
      prisma.simulationSession.count({ where: { traineeId: { in: traineeIds } } }),
      prisma.voiceSession.count({ where: { traineeId: { in: traineeIds } } }),
      prisma.simulationSession.count({
        where: {
          traineeId: { in: traineeIds },
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.voiceSession.count({
        where: {
          traineeId: { in: traineeIds },
          createdAt: { gte: startOfMonth },
        },
      }),
    ]);

    // Get API cost this month
    const apiUsage = await prisma.apiUsage.aggregate({
      where: {
        organizationId: orgId,
        usageDate: { gte: startOfMonth },
      },
      _sum: { cost: true },
    });

    // Get recent users
    const recentUsers = org.trainees
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        email: t.email,
        firstName: t.firstName,
        lastName: t.lastName,
        role: t.role,
        status: t.status,
        organizationId: t.organizationId,
        organizationName: org.name,
        lastActiveAt: t.lastActiveAt,
        createdAt: t.createdAt,
      }));

    return {
      ...org,
      userCount: org.trainees.length,
      activeUserCount: org.trainees.filter((t) => t.lastActiveAt && t.lastActiveAt >= thirtyDaysAgo).length,
      trainerCount: org.trainees.filter((t) => t.role === 'trainer').length,
      traineeCount: org.trainees.filter((t) => t.role === 'trainee').length,
      groupCount: org.groups.length,
      totalSimulations,
      totalVoiceSessions,
      subscription: org.subscription as OrganizationDetails['subscription'],
      recentUsers,
      usageStats: {
        simulationsThisMonth,
        voiceMinutesThisMonth: voiceSessionsThisMonth, // TODO: Calculate actual minutes
        apiCostThisMonth: apiUsage._sum.cost || 0,
      },
    };
  }

  async createOrganization(data: CreateOrgInput): Promise<Organization> {
    return prisma.organization.create({
      data: {
        name: data.name,
        type: data.type,
        contactEmail: data.contactEmail,
        phone: data.phone,
        address: data.address,
        status: 'active',
      },
    });
  }

  async updateOrganizationStatus(orgId: string, input: UpdateOrgStatusInput, adminId: string): Promise<Organization> {
    const updateData: Record<string, unknown> = {
      status: input.status,
    };

    if (input.status === 'suspended') {
      updateData.suspendedAt = new Date();
      updateData.suspendedBy = adminId;
      updateData.suspensionReason = input.reason || null;
    } else if (input.status === 'active') {
      updateData.suspendedAt = null;
      updateData.suspendedBy = null;
      updateData.suspensionReason = null;
    }

    return prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });
  }

  // ==========================================
  // Subscription Management
  // ==========================================

  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return prisma.subscriptionPlan.findMany({
      orderBy: { monthlyPrice: 'asc' },
    });
  }

  async createPlan(data: CreatePlanInput): Promise<SubscriptionPlan> {
    return prisma.subscriptionPlan.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        monthlyPrice: data.monthlyPrice,
        annualPrice: data.annualPrice,
        seatLimit: data.seatLimit,
        simulationLimit: data.simulationLimit,
        voiceMinutesLimit: data.voiceMinutesLimit,
        features: JSON.stringify(data.features || []),
        isActive: true,
      },
    });
  }

  async updatePlan(planId: string, data: UpdatePlanInput): Promise<SubscriptionPlan> {
    const updateData: Record<string, unknown> = {};

    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.monthlyPrice !== undefined) updateData.monthlyPrice = data.monthlyPrice;
    if (data.annualPrice !== undefined) updateData.annualPrice = data.annualPrice;
    if (data.seatLimit !== undefined) updateData.seatLimit = data.seatLimit;
    if (data.simulationLimit !== undefined) updateData.simulationLimit = data.simulationLimit;
    if (data.voiceMinutesLimit !== undefined) updateData.voiceMinutesLimit = data.voiceMinutesLimit;
    if (data.features !== undefined) updateData.features = JSON.stringify(data.features);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return prisma.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });
  }

  async assignSubscription(orgId: string, input: AssignSubscriptionInput): Promise<Subscription> {
    const startDate = input.startDate || new Date();
    const endDate = new Date(startDate);

    if (input.billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Upsert subscription
    return prisma.subscription.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        status: input.status || 'active',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
      },
      update: {
        planId: input.planId,
        billingCycle: input.billingCycle,
        status: input.status || 'active',
        currentPeriodStart: startDate,
        currentPeriodEnd: endDate,
        cancelledAt: null,
      },
    });
  }

  async updateSubscription(orgId: string, input: UpdateSubscriptionInput): Promise<Subscription> {
    const updateData: Record<string, unknown> = {};

    if (input.planId) updateData.planId = input.planId;
    if (input.billingCycle) updateData.billingCycle = input.billingCycle;
    if (input.status) {
      updateData.status = input.status;
      if (input.status === 'cancelled') {
        updateData.cancelledAt = new Date();
      }
    }

    return prisma.subscription.update({
      where: { organizationId: orgId },
      data: updateData,
    });
  }

  async cancelSubscription(orgId: string): Promise<void> {
    await prisma.subscription.update({
      where: { organizationId: orgId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });
  }

  // ==========================================
  // Revenue & Analytics
  // ==========================================

  async getRevenueMetrics(period?: string): Promise<RevenueMetrics> {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Get all subscriptions with plans
    const subscriptions = await prisma.subscription.findMany({
      include: { plan: true },
    });

    // Calculate current MRR
    const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
    let currentMRR = 0;

    for (const sub of activeSubscriptions) {
      if (sub.billingCycle === 'monthly') {
        currentMRR += sub.plan.monthlyPrice;
      } else if (sub.plan.annualPrice) {
        currentMRR += sub.plan.annualPrice / 12;
      }
    }

    // Calculate previous MRR (simplified - just use same calculation)
    // In production, you'd track historical MRR
    const previousMRR = currentMRR * 0.95; // Assume 5% growth for demo

    // Calculate revenue by plan
    const planRevenueMap = new Map<string, { plan: SubscriptionPlan; count: number; revenue: number }>();

    for (const sub of activeSubscriptions) {
      const existing = planRevenueMap.get(sub.planId);
      const monthlyRevenue = sub.billingCycle === 'monthly' ? sub.plan.monthlyPrice : (sub.plan.annualPrice || 0) / 12;

      if (existing) {
        existing.count++;
        existing.revenue += monthlyRevenue;
      } else {
        planRevenueMap.set(sub.planId, {
          plan: sub.plan,
          count: 1,
          revenue: monthlyRevenue,
        });
      }
    }

    const revenueByPlan = Array.from(planRevenueMap.values()).map((item) => ({
      planId: item.plan.id,
      planName: item.plan.name,
      displayName: item.plan.displayName,
      revenue: Math.round(item.revenue * 100) / 100,
      count: item.count,
      percentOfTotal: currentMRR > 0 ? Math.round((item.revenue / currentMRR) * 100) : 0,
    }));

    // Generate revenue by month (last 6 months)
    const revenueByMonth: RevenueMetrics['revenueByMonth'] = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      revenueByMonth.push({
        month: monthDate.toLocaleString('default', { month: 'short' }),
        year: monthDate.getFullYear(),
        revenue: Math.round(currentMRR * (1 - i * 0.02) * 100) / 100, // Simulated growth
        subscriptionCount: activeSubscriptions.length,
      });
    }

    const trialCount = subscriptions.filter((s) => s.status === 'trial').length;
    const expiredCount = subscriptions.filter((s) => s.status === 'expired').length;
    const cancelledCount = subscriptions.filter((s) => s.status === 'cancelled').length;

    return {
      currentMRR: Math.round(currentMRR * 100) / 100,
      previousMRR: Math.round(previousMRR * 100) / 100,
      mrrGrowth: Math.round((currentMRR - previousMRR) * 100) / 100,
      mrrGrowthPercent: previousMRR > 0 ? Math.round(((currentMRR - previousMRR) / previousMRR) * 100) : 0,
      arr: Math.round(currentMRR * 12 * 100) / 100,
      activeSubscriptions: activeSubscriptions.length,
      trialSubscriptions: trialCount,
      expiredSubscriptions: expiredCount,
      cancelledSubscriptions: cancelledCount,
      churnRate: subscriptions.length > 0 ? Math.round((cancelledCount / subscriptions.length) * 100) : 0,
      revenueByPlan,
      revenueByMonth,
    };
  }

  async getApiUsageMetrics(period?: string): Promise<ApiUsageMetrics> {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usage = await prisma.apiUsage.findMany({
      where: {
        usageDate: { gte: startDate },
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    // Calculate totals
    let totalCost = 0;
    let totalRequests = 0;
    const providerMap = new Map<string, { cost: number; requests: number }>();
    const orgMap = new Map<string, { name: string; cost: number; requests: number }>();
    const dailyMap = new Map<string, { cost: number; requests: number }>();

    for (const u of usage) {
      totalCost += u.cost || 0;
      totalRequests++;

      // By provider
      const providerData = providerMap.get(u.provider) || { cost: 0, requests: 0 };
      providerData.cost += u.cost || 0;
      providerData.requests++;
      providerMap.set(u.provider, providerData);

      // By organization
      const orgData = orgMap.get(u.organizationId) || { name: u.organization.name, cost: 0, requests: 0 };
      orgData.cost += u.cost || 0;
      orgData.requests++;
      orgMap.set(u.organizationId, orgData);

      // By day
      const dateKey = u.usageDate.toISOString().split('T')[0];
      const dailyData = dailyMap.get(dateKey) || { cost: 0, requests: 0 };
      dailyData.cost += u.cost || 0;
      dailyData.requests++;
      dailyMap.set(dateKey, dailyData);
    }

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalRequests,
      costByProvider: Array.from(providerMap.entries()).map(([provider, data]) => ({
        provider,
        cost: Math.round(data.cost * 100) / 100,
        requests: data.requests,
        percentOfTotal: totalCost > 0 ? Math.round((data.cost / totalCost) * 100) : 0,
      })),
      costByOrganization: Array.from(orgMap.entries())
        .map(([orgId, data]) => ({
          orgId,
          orgName: data.name,
          cost: Math.round(data.cost * 100) / 100,
          requests: data.requests,
        }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10),
      dailyUsage: Array.from(dailyMap.entries())
        .map(([date, data]) => ({
          date,
          cost: Math.round(data.cost * 100) / 100,
          requests: data.requests,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // ==========================================
  // User Management
  // ==========================================

  async searchUsersGlobal(options: UserSearchOptions): Promise<PaginatedResult<UserSummary>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', query, organizationId, role, status } = options;

    const where: Record<string, unknown> = {
      role: { not: 'saas_super_admin' },
    };

    if (query) {
      where.OR = [
        { email: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
      ];
    }

    if (organizationId) {
      where.organizationId = organizationId;
    }

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.trainee.findMany({
        where,
        include: {
          organization: {
            select: { name: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.trainee.count({ where }),
    ]);

    const data: UserSummary[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      organizationId: u.organizationId,
      organizationName: u.organization.name,
      lastActiveAt: u.lastActiveAt,
      createdAt: u.createdAt,
    }));

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }

  async getUserDetails(userId: string): Promise<UserDetails> {
    const user = await prisma.trainee.findUnique({
      where: { id: userId },
      include: {
        organization: true,
        groupMemberships: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get simulation stats
    const [completedSimulations, totalVoiceSessions, avgScore] = await Promise.all([
      prisma.simulationSession.count({
        where: { traineeId: userId, status: 'completed' },
      }),
      prisma.voiceSession.count({
        where: { traineeId: userId },
      }),
      prisma.voiceSession.aggregate({
        where: { traineeId: userId },
        _avg: { overallScore: true },
      }),
    ]);

    return {
      ...user,
      organization: user.organization,
      completedSimulations,
      totalVoiceSessions,
      averageScore: avgScore._avg.overallScore,
      groupMemberships: user.groupMemberships.map((gm) => ({
        groupId: gm.group.id,
        groupName: gm.group.name,
      })),
    };
  }

  // ==========================================
  // Impersonation
  // ==========================================

  async impersonateOrganization(adminId: string, adminEmail: string, orgId: string): Promise<ImpersonationToken> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    // Generate impersonation token with short expiry
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const expiresIn = 3600; // 1 hour

    const token = jwt.sign(
      {
        userId: adminId,
        email: adminEmail,
        role: 'saas_super_admin',
        organizationId: null,
        impersonatingOrgId: orgId,
      },
      jwtSecret,
      { expiresIn }
    );

    return {
      token,
      expiresIn,
      organizationId: org.id,
      organizationName: org.name,
    };
  }

  // ==========================================
  // Audit Logs
  // ==========================================

  async getAuditLogs(options: AuditLogOptions): Promise<PaginatedResult<AuditLogEntry>> {
    const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc', actorId, action, targetType, targetId, startDate, endDate } = options;

    const where: Record<string, unknown> = {};

    if (actorId) where.actorId = actorId;
    if (action) where.action = { contains: action };
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, unknown>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, unknown>).lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs as AuditLogEntry[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    };
  }
}
