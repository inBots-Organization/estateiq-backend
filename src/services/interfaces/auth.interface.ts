export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  // For existing organization
  organizationId?: string;
  // For new organization onboarding
  organizationName?: string;
  industryType?: string;
  teamSize?: string;
  jobTitle?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
    // Teacher assignment info (for trainees)
    assignedTeacher?: string | null;
    assignedTeacherId?: string | null;
    currentSkillLevel?: string | null;
  };
}

// Role types for multi-tenant RBAC
export type UserRole = 'trainee' | 'trainer' | 'org_admin' | 'saas_super_admin';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId: string | null; // null for super admins
  impersonatingOrgId?: string; // for org impersonation by super admin
  originalRole?: UserRole; // original role when impersonating (set by middleware)
  iat?: number;
  exp?: number;
}

export interface IAuthService {
  login(input: LoginInput): Promise<AuthResult>;
  register(input: RegisterInput): Promise<AuthResult>;
  validateToken(token: string): Promise<TokenPayload>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  generateResetToken(email: string): Promise<string>;
  resetPassword(token: string, newPassword: string): Promise<void>;
}
