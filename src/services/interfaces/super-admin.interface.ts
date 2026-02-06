import { Organization, SubscriptionPlan, Subscription, AuditLog, Trainee } from '@prisma/client';

// ==========================================
// Pagination & Common Types
// ==========================================

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

// ==========================================
// Platform Overview
// ==========================================

export interface PlatformOverview {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  activeUsersLast30Days: number;
  totalSimulations: number;
  totalVoiceSessions: number;
  mrr: number;
  arr: number;
  recentActivity: RecentActivity[];
}

export interface RecentActivity {
  id: string;
  type: 'org_created' | 'subscription_updated' | 'user_registered' | 'org_suspended';
  description: string;
  targetId: string;
  targetName: string;
  createdAt: Date;
}

// ==========================================
// Organization Management
// ==========================================

export interface OrganizationSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  contactEmail: string | null;
  userCount: number;
  activeUserCount: number;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  lastActivityAt: Date | null;
}

export interface OrganizationDetails extends Organization {
  userCount: number;
  activeUserCount: number;
  trainerCount: number;
  traineeCount: number;
  groupCount: number;
  totalSimulations: number;
  totalVoiceSessions: number;
  subscription: SubscriptionWithPlan | null;
  recentUsers: UserSummary[];
  usageStats: UsageStats;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export interface UsageStats {
  simulationsThisMonth: number;
  voiceMinutesThisMonth: number;
  apiCostThisMonth: number;
}

export interface CreateOrgInput {
  name: string;
  type: string;
  contactEmail?: string;
  phone?: string;
  address?: string;
}

export interface UpdateOrgStatusInput {
  status: 'active' | 'suspended' | 'blocked';
  reason?: string;
}

// ==========================================
// Subscription Management
// ==========================================

export interface CreatePlanInput {
  name: string;
  displayName: string;
  description?: string;
  monthlyPrice: number;
  annualPrice?: number;
  seatLimit?: number;
  simulationLimit?: number;
  voiceMinutesLimit?: number;
  features?: string[];
}

export interface UpdatePlanInput {
  displayName?: string;
  description?: string;
  monthlyPrice?: number;
  annualPrice?: number;
  seatLimit?: number;
  simulationLimit?: number;
  voiceMinutesLimit?: number;
  features?: string[];
  isActive?: boolean;
}

export interface AssignSubscriptionInput {
  planId: string;
  billingCycle: 'monthly' | 'annual';
  status?: 'active' | 'trial';
  startDate?: Date;
}

export interface UpdateSubscriptionInput {
  planId?: string;
  billingCycle?: 'monthly' | 'annual';
  status?: 'active' | 'suspended' | 'cancelled';
}

// ==========================================
// Revenue & Analytics
// ==========================================

export interface RevenueMetrics {
  currentMRR: number;
  previousMRR: number;
  mrrGrowth: number;
  mrrGrowthPercent: number;
  arr: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  cancelledSubscriptions: number;
  churnRate: number;
  revenueByPlan: PlanRevenue[];
  revenueByMonth: MonthlyRevenue[];
}

export interface PlanRevenue {
  planId: string;
  planName: string;
  displayName: string;
  revenue: number;
  count: number;
  percentOfTotal: number;
}

export interface MonthlyRevenue {
  month: string;
  year: number;
  revenue: number;
  subscriptionCount: number;
}

export interface ApiUsageMetrics {
  totalCost: number;
  totalRequests: number;
  costByProvider: ProviderCost[];
  costByOrganization: OrgCost[];
  dailyUsage: DailyUsage[];
}

export interface ProviderCost {
  provider: string;
  cost: number;
  requests: number;
  percentOfTotal: number;
}

export interface OrgCost {
  orgId: string;
  orgName: string;
  cost: number;
  requests: number;
}

export interface DailyUsage {
  date: string;
  cost: number;
  requests: number;
}

// ==========================================
// User Management
// ==========================================

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  organizationId: string;
  organizationName: string;
  lastActiveAt: Date | null;
  createdAt: Date;
}

export interface UserDetails extends Trainee {
  organization: Organization;
  completedSimulations: number;
  totalVoiceSessions: number;
  averageScore: number | null;
  groupMemberships: { groupId: string; groupName: string }[];
}

export interface UserSearchOptions extends PaginationOptions {
  query?: string;
  organizationId?: string;
  role?: string;
  status?: string;
}

// ==========================================
// Impersonation
// ==========================================

export interface ImpersonationToken {
  token: string;
  expiresIn: number;
  organizationId: string;
  organizationName: string;
}

// ==========================================
// Audit Logs
// ==========================================

export interface AuditLogEntry extends AuditLog {
  // Extended fields for display
}

export interface AuditLogOptions extends PaginationOptions {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
}

// ==========================================
// Service Interface
// ==========================================

export interface ISuperAdminService {
  // Platform Overview
  getPlatformOverview(): Promise<PlatformOverview>;

  // Organization Management
  getAllOrganizations(options: PaginationOptions & { status?: string; search?: string }): Promise<PaginatedResult<OrganizationSummary>>;
  getOrganizationDetails(orgId: string): Promise<OrganizationDetails>;
  createOrganization(data: CreateOrgInput): Promise<Organization>;
  updateOrganizationStatus(orgId: string, input: UpdateOrgStatusInput, adminId: string): Promise<Organization>;

  // Subscription Management
  getAllPlans(): Promise<SubscriptionPlan[]>;
  createPlan(data: CreatePlanInput): Promise<SubscriptionPlan>;
  updatePlan(planId: string, data: UpdatePlanInput): Promise<SubscriptionPlan>;
  assignSubscription(orgId: string, input: AssignSubscriptionInput): Promise<Subscription>;
  updateSubscription(orgId: string, input: UpdateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(orgId: string): Promise<void>;

  // Revenue & Analytics
  getRevenueMetrics(period?: string): Promise<RevenueMetrics>;
  getApiUsageMetrics(period?: string): Promise<ApiUsageMetrics>;

  // User Management
  searchUsersGlobal(options: UserSearchOptions): Promise<PaginatedResult<UserSummary>>;
  getUserDetails(userId: string): Promise<UserDetails>;

  // Impersonation
  impersonateOrganization(adminId: string, adminEmail: string, orgId: string): Promise<ImpersonationToken>;

  // Audit
  getAuditLogs(options: AuditLogOptions): Promise<PaginatedResult<AuditLogEntry>>;
}
