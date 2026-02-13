import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { superAdminOnly, superAdminAuditMiddleware } from '../middleware/super-admin.middleware';
import { SuperAdminService } from '../services/super-admin/super-admin.service';
import {
  CreateOrgInput,
  UpdateOrgStatusInput,
  CreatePlanInput,
  UpdatePlanInput,
  AssignSubscriptionInput,
  UpdateSubscriptionInput,
} from '../services/interfaces/super-admin.interface';

const router = Router();
const superAdminService = new SuperAdminService();

// All routes require super admin authentication
router.use(authMiddleware(['saas_super_admin']));
router.use(superAdminOnly());
router.use(superAdminAuditMiddleware());

// ==========================================
// Platform Overview
// ==========================================

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = await superAdminService.getPlatformOverview();
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Organization Management
// ==========================================

router.get('/organizations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy, sortOrder, status, search } = req.query;

    const result = await superAdminService.getAllOrganizations({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      status: status as string,
      search: search as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/organizations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const details = await superAdminService.getOrganizationDetails(id);
    res.json(details);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization not found') {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    next(error);
  }
});

router.post('/organizations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: CreateOrgInput = req.body;

    if (!data.name || !data.type) {
      res.status(400).json({ error: 'Name and type are required' });
      return;
    }

    const org = await superAdminService.createOrganization(data);
    res.status(201).json(org);
  } catch (error) {
    next(error);
  }
});

router.patch('/organizations/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const input: UpdateOrgStatusInput = req.body;

    if (!input.status || !['active', 'suspended', 'blocked'].includes(input.status)) {
      res.status(400).json({ error: 'Valid status is required (active, suspended, blocked)' });
      return;
    }

    const org = await superAdminService.updateOrganizationStatus(id, input, req.user!.userId);
    res.json(org);
  } catch (error) {
    next(error);
  }
});

// Delete organization permanently with all its data
router.delete('/organizations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await superAdminService.deleteOrganization(id);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization not found') {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    if (error instanceof Error && error.message.includes('Cannot delete')) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post('/organizations/:id/impersonate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await superAdminService.impersonateOrganization(req.user!.userId, req.user!.email, id);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization not found') {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    next(error);
  }
});

// ==========================================
// Subscription Plans
// ==========================================

router.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await superAdminService.getAllPlans();
    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

router.post('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data: CreatePlanInput = req.body;

    if (!data.name || !data.displayName || data.monthlyPrice === undefined) {
      res.status(400).json({ error: 'Name, displayName, and monthlyPrice are required' });
      return;
    }

    const plan = await superAdminService.createPlan(data);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

router.patch('/plans/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data: UpdatePlanInput = req.body;
    const plan = await superAdminService.updatePlan(id, data);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Organization Subscriptions
// ==========================================

router.post('/organizations/:id/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const input: AssignSubscriptionInput = req.body;

    if (!input.planId || !input.billingCycle) {
      res.status(400).json({ error: 'planId and billingCycle are required' });
      return;
    }

    const subscription = await superAdminService.assignSubscription(id, input);
    res.status(201).json(subscription);
  } catch (error) {
    next(error);
  }
});

router.patch('/organizations/:id/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const input: UpdateSubscriptionInput = req.body;
    const subscription = await superAdminService.updateSubscription(id, input);
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

router.delete('/organizations/:id/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await superAdminService.cancelSubscription(id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Revenue & Analytics
// ==========================================

router.get('/revenue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period } = req.query;
    const metrics = await superAdminService.getRevenueMetrics(period as string);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

router.get('/api-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period } = req.query;
    const metrics = await superAdminService.getApiUsageMetrics(period as string);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Global User Management
// ==========================================

router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy, sortOrder, query, organizationId, role, status } = req.query;

    const result = await superAdminService.searchUsersGlobal({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      query: query as string,
      organizationId: organizationId as string,
      role: role as string,
      status: status as string,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = await superAdminService.getUserDetails(id);
    res.json(user);
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    next(error);
  }
});

// ==========================================
// Audit Logs
// ==========================================

router.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy, sortOrder, actorId, action, targetType, targetId, startDate, endDate } = req.query;

    const result = await superAdminService.getAuditLogs({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      actorId: actorId as string,
      action: action as string,
      targetType: targetType as string,
      targetId: targetId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// System Health
// ==========================================

router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
