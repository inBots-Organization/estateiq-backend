import { injectable, inject } from 'tsyringe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { ITraineeRepository } from '../../repositories/interfaces/trainee.repository.interface';
import {
  IAuthService,
  LoginInput,
  RegisterInput,
  AuthResult,
  TokenPayload,
  UserRole,
} from '../interfaces/auth.interface';

// Role mappings for backward compatibility
const ROLE_MAPPING: Record<string, UserRole> = {
  user: 'trainee',
  admin: 'org_admin',
  trainee: 'trainee',
  trainer: 'trainer',
  org_admin: 'org_admin',
  saas_super_admin: 'saas_super_admin',
};

@injectable()
export class AuthService implements IAuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;

  constructor(
    @inject('TraineeRepository') private traineeRepository: ITraineeRepository,
    @inject('PrismaClient') private prisma: PrismaClient
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const trainee = await this.traineeRepository.findByEmail(input.email);
    if (!trainee) {
      throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, trainee.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    if (trainee.status === 'suspended') {
      throw new Error('Account is suspended');
    }

    // Use the actual role from the database, normalize for backward compatibility
    const dbRole = (trainee as { role?: string }).role || 'user';
    const userRole = this.normalizeRole(dbRole);

    const accessToken = this.generateToken({
      userId: trainee.id,
      email: trainee.email,
      role: userRole,
      organizationId: trainee.organizationId,
    });

    await this.traineeRepository.update(trainee.id, {
      lastActiveAt: new Date(),
    });

    // Get trainee's assigned teacher if any (for trainees)
    const traineeWithTeacher = userRole === 'trainee'
      ? await this.prisma.trainee.findUnique({
          where: { id: trainee.id },
          select: {
            assignedTeacher: true,
            assignedTeacherId: true,
            currentSkillLevel: true,
            assignedTeacherRecord: {
              select: {
                avatarUrl: true,
                displayNameAr: true,
                displayNameEn: true,
                voiceId: true,
              },
            },
          },
        })
      : null;

    // Don't include base64 avatar in response - it's too large for localStorage
    // Only include URL-based avatars (not data: URIs)
    const avatarUrl = traineeWithTeacher?.assignedTeacherRecord?.avatarUrl;
    const safeAvatarUrl = avatarUrl && !avatarUrl.startsWith('data:') ? avatarUrl : null;

    return {
      accessToken,
      user: {
        id: trainee.id,
        email: trainee.email,
        firstName: trainee.firstName,
        lastName: trainee.lastName,
        role: userRole,
        organizationId: trainee.organizationId,
        // Include assigned teacher info for trainees
        assignedTeacher: traineeWithTeacher?.assignedTeacher || null,
        assignedTeacherId: traineeWithTeacher?.assignedTeacherId || null,
        currentSkillLevel: traineeWithTeacher?.currentSkillLevel || null,
        assignedTeacherAvatar: safeAvatarUrl,
        assignedTeacherDisplayNameAr: traineeWithTeacher?.assignedTeacherRecord?.displayNameAr || null,
        assignedTeacherDisplayNameEn: traineeWithTeacher?.assignedTeacherRecord?.displayNameEn || null,
        assignedTeacherVoiceId: traineeWithTeacher?.assignedTeacherRecord?.voiceId || null,
      },
    };
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    const existingTrainee = await this.traineeRepository.findByEmail(input.email);
    if (existingTrainee) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    let organizationId = input.organizationId;
    let userRole: UserRole = 'trainee';

    // If organizationName is provided, create a new organization and make user org_admin
    if (input.organizationName) {
      // Determine organization type based on industry
      const orgType = this.mapIndustryToOrgType(input.industryType);

      // Create the new organization
      const organization = await this.prisma.organization.create({
        data: {
          name: input.organizationName,
          type: orgType,
        },
      });

      organizationId = organization.id;
      userRole = 'org_admin'; // First user of new org is admin
    }

    // Fallback to default org if no organization specified
    if (!organizationId) {
      organizationId = 'default-org';
    }

    const trainee = await this.traineeRepository.create({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      organizationId,
      passwordHash,
      role: userRole,
    });

    const accessToken = this.generateToken({
      userId: trainee.id,
      email: trainee.email,
      role: userRole,
      organizationId: trainee.organizationId,
    });

    return {
      accessToken,
      user: {
        id: trainee.id,
        email: trainee.email,
        firstName: trainee.firstName,
        lastName: trainee.lastName,
        role: userRole,
        organizationId: trainee.organizationId,
        // New users don't have assigned teacher yet
        assignedTeacher: null,
        assignedTeacherId: null,
        currentSkillLevel: null,
      },
    };
  }

  private mapIndustryToOrgType(industryType?: string): string {
    // Map industry types to organization types
    const industryMapping: Record<string, string> = {
      'real_estate_brokerage': 'training_company',
      'property_development': 'corporate_client',
      'property_management': 'corporate_client',
      'real_estate_investment': 'corporate_client',
      'corporate_real_estate': 'corporate_client',
      'training_consulting': 'training_company',
    };
    return industryMapping[industryType || ''] || 'training_company';
  }

  async validateToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch {
      throw new Error('Invalid token');
    }
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    const payload = await this.validateToken(refreshToken);

    const trainee = await this.traineeRepository.findById(payload.userId);
    if (!trainee) {
      throw new Error('User not found');
    }

    // Use the actual role from the database, normalize for backward compatibility
    const dbRole = (trainee as { role?: string }).role || 'user';
    const userRole = this.normalizeRole(dbRole);

    const accessToken = this.generateToken({
      userId: trainee.id,
      email: trainee.email,
      role: userRole,
      organizationId: trainee.organizationId,
    });

    // Get trainee's assigned teacher if any (for trainees)
    const traineeWithTeacher = userRole === 'trainee'
      ? await this.prisma.trainee.findUnique({
          where: { id: trainee.id },
          select: {
            assignedTeacher: true,
            assignedTeacherId: true,
            currentSkillLevel: true,
            assignedTeacherRecord: {
              select: {
                avatarUrl: true,
                displayNameAr: true,
                displayNameEn: true,
                voiceId: true,
              },
            },
          },
        })
      : null;

    // Don't include base64 avatar in response - it's too large for localStorage
    const refreshAvatarUrl = traineeWithTeacher?.assignedTeacherRecord?.avatarUrl;
    const safeRefreshAvatarUrl = refreshAvatarUrl && !refreshAvatarUrl.startsWith('data:') ? refreshAvatarUrl : null;

    return {
      accessToken,
      user: {
        id: trainee.id,
        email: trainee.email,
        firstName: trainee.firstName,
        lastName: trainee.lastName,
        role: userRole,
        organizationId: trainee.organizationId,
        assignedTeacher: traineeWithTeacher?.assignedTeacher || null,
        assignedTeacherId: traineeWithTeacher?.assignedTeacherId || null,
        currentSkillLevel: traineeWithTeacher?.currentSkillLevel || null,
        assignedTeacherAvatar: safeRefreshAvatarUrl,
        assignedTeacherDisplayNameAr: traineeWithTeacher?.assignedTeacherRecord?.displayNameAr || null,
        assignedTeacherDisplayNameEn: traineeWithTeacher?.assignedTeacherRecord?.displayNameEn || null,
        assignedTeacherVoiceId: traineeWithTeacher?.assignedTeacherRecord?.voiceId || null,
      },
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const trainee = await this.traineeRepository.findById(userId);
    if (!trainee) {
      throw new Error('User not found');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, trainee.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await this.traineeRepository.update(userId, {
      passwordHash: newPasswordHash,
      passwordChangedAt: new Date(),
    });
  }

  async generateResetToken(email: string): Promise<string> {
    const trainee = await this.traineeRepository.findByEmail(email);
    if (!trainee) {
      throw new Error('Email not found');
    }

    const resetToken = jwt.sign(
      { userId: trainee.id, purpose: 'password-reset' },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string; purpose: string };

      if (decoded.purpose !== 'password-reset') {
        throw new Error('Invalid reset token');
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await this.traineeRepository.update(decoded.userId, {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      });
    } catch {
      throw new Error('Invalid or expired reset token');
    }
  }

  private generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);
  }

  private generatePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  // Normalize role for backward compatibility (user -> trainee, admin -> org_admin)
  private normalizeRole(role: string): UserRole {
    return ROLE_MAPPING[role] || 'trainee';
  }
}
