import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { IAuthService } from '../services/interfaces/auth.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  LoginInputSchema,
  RegisterInputSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '../dtos/validation/auth.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class AuthController {
  public router: Router;

  constructor(
    @inject('AuthService') private authService: IAuthService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.post(
      '/login',
      validateRequest(LoginInputSchema),
      this.login.bind(this)
    );

    this.router.post(
      '/register',
      validateRequest(RegisterInputSchema),
      this.register.bind(this)
    );

    this.router.post(
      '/refresh',
      this.refreshToken.bind(this)
    );

    this.router.post(
      '/change-password',
      authMiddleware(),
      validateRequest(ChangePasswordSchema),
      this.changePassword.bind(this)
    );

    this.router.post(
      '/forgot-password',
      validateRequest(ForgotPasswordSchema),
      this.forgotPassword.bind(this)
    );

    this.router.post(
      '/reset-password',
      validateRequest(ResetPasswordSchema),
      this.resetPassword.bind(this)
    );

    this.router.get(
      '/me',
      authMiddleware(),
      this.getCurrentUser.bind(this)
    );
  }

  private async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      const result = await this.authService.login({ email, password });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid')) {
        res.status(401).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        email,
        password,
        firstName,
        lastName,
        organizationId,
        organizationName,
        industryType,
        teamSize,
        jobTitle,
      } = req.body;

      const result = await this.authService.register({
        email,
        password,
        firstName,
        lastName,
        organizationId,
        organizationName,
        industryType,
        teamSize,
        jobTitle,
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already registered')) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Refresh token required' });
        return;
      }

      const token = authHeader.substring(7);
      const result = await this.authService.refreshToken(token);

      res.status(200).json(result);
    } catch (error) {
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }

  private async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      await this.authService.changePassword(userId, currentPassword, newPassword);

      res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('incorrect')) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      await this.authService.generateResetToken(email);

      res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (error) {
      res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }
  }

  private async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      await this.authService.resetPassword(token, newPassword);

      res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
      res.status(400).json({ error: 'Invalid or expired reset token' });
    }
  }

  private async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        userId: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      });
    } catch (error) {
      next(error);
    }
  }
}
