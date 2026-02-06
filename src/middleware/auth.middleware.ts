import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload, UserRole } from '../services/interfaces/auth.interface';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      organizationId?: string;
    }
  }
}

// Role mappings for backward compatibility
// Maps old roles to new roles
const ROLE_MAPPING: Record<string, UserRole> = {
  user: 'trainee',
  admin: 'org_admin',
  trainee: 'trainee',
  trainer: 'trainer',
  org_admin: 'org_admin',
  saas_super_admin: 'saas_super_admin',
};

// Normalize role for backward compatibility
function normalizeRole(role: string): UserRole {
  return ROLE_MAPPING[role] || 'trainee';
}

// Export for use in other modules
export { normalizeRole, ROLE_MAPPING };

export function authMiddleware(allowedRoles?: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization header missing or invalid' });
        return;
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';

      const decoded = jwt.verify(token, jwtSecret) as TokenPayload;

      // Normalize role for backward compatibility
      const normalizedRole = normalizeRole(decoded.role);

      if (allowedRoles && allowedRoles.length > 0) {
        // Normalize allowed roles for comparison
        const normalizedAllowedRoles = allowedRoles.map((r) => normalizeRole(r));

        // Special handling for super admin impersonation:
        // If super admin is impersonating an organization and the route allows org_admin,
        // grant access as if they were an org_admin
        const isSuperAdminImpersonating =
          normalizedRole === 'saas_super_admin' &&
          decoded.impersonatingOrgId;

        const canAccessAsImpersonator =
          isSuperAdminImpersonating &&
          normalizedAllowedRoles.includes('org_admin');

        if (!normalizedAllowedRoles.includes(normalizedRole) && !canAccessAsImpersonator) {
          res.status(403).json({ error: 'Insufficient permissions' });
          return;
        }
      }

      // Attach user with normalized role
      // For impersonating super admins, we set role to org_admin for proper permission checks
      const effectiveRole =
        normalizedRole === 'saas_super_admin' && decoded.impersonatingOrgId
          ? 'org_admin'
          : normalizedRole;

      req.user = {
        ...decoded,
        role: effectiveRole,
        // Keep original role for reference
        originalRole: normalizedRole,
      };

      // Also attach organizationId at request level for convenience
      // For super admins impersonating, use the impersonated org
      if (normalizedRole === 'saas_super_admin') {
        req.organizationId = decoded.impersonatingOrgId || undefined;
      } else {
        req.organizationId = decoded.organizationId || undefined;
      }

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired' });
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      res.status(500).json({ error: 'Authentication error' });
    }
  };
}

export function optionalAuthMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';

      const decoded = jwt.verify(token, jwtSecret) as TokenPayload;
      req.user = decoded;
      next();
    } catch {
      next();
    }
  };
}
