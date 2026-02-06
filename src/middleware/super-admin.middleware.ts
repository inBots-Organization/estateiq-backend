import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Middleware to require super admin role
 * Only allows access to users with saas_super_admin role
 */
export function superAdminOnly() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.role !== 'saas_super_admin') {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }

    next();
  };
}

/**
 * Audit logging middleware for super admin actions
 * Logs all mutation operations (POST, PATCH, PUT, DELETE) to the audit log
 */
export function superAdminAuditMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role === 'saas_super_admin') {
      // Store original end function
      const originalEnd = res.end.bind(res);

      // Override end to log after response
      res.end = function (chunk?: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void): Response {
        // Log action after response completes (only for mutations)
        if (req.method !== 'GET' && res.statusCode < 400) {
          logSuperAdminAction(req).catch((error) => {
            console.error('[SuperAdmin] Failed to log audit:', error);
          });
        }

        // Handle different overload signatures
        if (typeof encoding === 'function') {
          return originalEnd(chunk, encoding);
        }
        return originalEnd(chunk, encoding as BufferEncoding, cb);
      };
    }

    next();
  };
}

/**
 * Extract target type from request path
 */
function extractTargetType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Remove 'api' and 'super-admin' prefixes
  const relevantSegments = segments.filter((s) => s !== 'api' && s !== 'super-admin');

  if (relevantSegments.length > 0) {
    // Return the first meaningful segment (e.g., 'organizations', 'plans', 'users')
    return relevantSegments[0];
  }

  return 'unknown';
}

/**
 * Extract target ID from request params
 */
function extractTargetId(params: Record<string, string>): string {
  // Common ID param names
  const idParams = ['id', 'organizationId', 'userId', 'planId', 'subscriptionId'];

  for (const param of idParams) {
    if (params[param]) {
      return params[param];
    }
  }

  return 'n/a';
}

/**
 * Log super admin action to audit log
 */
async function logSuperAdminAction(req: Request): Promise<void> {
  try {
    // Extract action name from method and path
    const pathSegments = req.path.split('/').filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];

    // Determine action name
    let action = `${req.method.toLowerCase()}_${extractTargetType(req.path)}`;

    // Add more specific action names for known endpoints
    if (lastSegment === 'status') {
      const status = req.body?.status;
      action = status === 'suspended' ? 'organization_suspend' : 'organization_unsuspend';
    } else if (lastSegment === 'impersonate') {
      action = 'organization_impersonate';
    } else if (lastSegment === 'subscription') {
      action = req.method === 'POST' ? 'subscription_assign' : 'subscription_update';
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        actorEmail: req.user!.email,
        action,
        targetType: extractTargetType(req.path),
        targetId: extractTargetId(req.params),
        details: JSON.stringify({
          method: req.method,
          path: req.path,
          body: sanitizeBody(req.body),
          query: req.query,
        }),
        ipAddress: req.ip || req.socket?.remoteAddress || null,
      },
    });

    console.log(`[SuperAdmin Audit] ${req.user!.email} performed ${action} on ${extractTargetType(req.path)}:${extractTargetId(req.params)}`);
  } catch (error) {
    console.error('[SuperAdmin] Failed to create audit log:', error);
    // Don't throw - audit logging should not break the request
  }
}

/**
 * Sanitize request body to remove sensitive data before logging
 */
function sanitizeBody(body: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!body) return {};

  const sensitiveFields = ['password', 'passwordHash', 'token', 'secret', 'apiKey'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Check if organization is suspended
 * Can be used to prevent access to suspended organizations
 */
export async function checkOrgNotSuspended(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });

  return org?.status === 'active';
}

/**
 * Middleware to check if target organization is not suspended
 * Super admins can still access suspended organizations
 */
export function ensureOrgNotSuspended(orgIdParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Super admins can access suspended organizations
    if (req.user?.role === 'saas_super_admin') {
      next();
      return;
    }

    const orgId = req.params[orgIdParam] || req.user?.organizationId;

    if (!orgId) {
      next();
      return;
    }

    const isActive = await checkOrgNotSuspended(orgId);

    if (!isActive) {
      res.status(403).json({
        error: 'Organization is suspended',
        code: 'ORG_SUSPENDED',
      });
      return;
    }

    next();
  };
}
