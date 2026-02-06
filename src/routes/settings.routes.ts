import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';
import bcrypt from 'bcryptjs';

const router = Router();

// All settings routes require authentication
router.use(authMiddleware());

// Default settings structure
const DEFAULT_SETTINGS = {
  emailNotifications: true,
  weeklyReports: true,
  lowScoreAlerts: true,
  lowScoreThreshold: 60,
};

// GET /api/settings/organization - Get organization settings
router.get('/organization', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');

    const user = await traineeRepo.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Parse settings JSON
    let settings = DEFAULT_SETTINGS;
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(organization.settings || '{}') };
    } catch {
      // Use defaults if parsing fails
    }

    res.json({
      id: organization.id,
      name: organization.name,
      type: organization.type,
      contactEmail: organization.contactEmail || user.email,
      phone: organization.phone || '',
      address: organization.address || '',
      logoUrl: organization.logoUrl || '',
      settings,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching organization settings:', error);
    res.status(500).json({ error: 'Failed to fetch organization settings' });
  }
});

// PATCH /api/settings/organization - Update organization settings (org_admin only)
router.patch('/organization', authMiddleware(['org_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');

    const user = await traineeRepo.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { name, contactEmail, phone, address } = req.body;

    const organization = await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...(name && { name }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
      },
    });

    res.json({
      id: organization.id,
      name: organization.name,
      type: organization.type,
      contactEmail: organization.contactEmail,
      phone: organization.phone,
      address: organization.address,
      message: 'Organization settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating organization settings:', error);
    res.status(500).json({ error: 'Failed to update organization settings' });
  }
});

// PATCH /api/settings/notifications - Update notification settings (org_admin only)
router.patch('/notifications', authMiddleware(['org_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');

    const user = await traineeRepo.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { emailNotifications, weeklyReports, lowScoreAlerts, lowScoreThreshold } = req.body;

    // Get current organization
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });

    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Parse existing settings and merge with new ones
    let currentSettings = DEFAULT_SETTINGS;
    try {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(organization.settings || '{}') };
    } catch {
      // Use defaults
    }

    const newSettings = {
      ...currentSettings,
      ...(emailNotifications !== undefined && { emailNotifications }),
      ...(weeklyReports !== undefined && { weeklyReports }),
      ...(lowScoreAlerts !== undefined && { lowScoreAlerts }),
      ...(lowScoreThreshold !== undefined && { lowScoreThreshold }),
    };

    // Update organization with new settings
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        settings: JSON.stringify(newSettings),
      },
    });

    res.json({
      settings: newSettings,
      message: 'Notification settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// POST /api/settings/change-password - Change user password
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Get user with password hash
    const user = await prisma.trainee.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.trainee.update({
      where: { id: req.user!.userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
      },
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /api/settings/system - Get system information (read-only)
router.get('/system', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Check database connection
    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    res.json({
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      apiStatus: 'operational',
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ error: 'Failed to fetch system information' });
  }
});

// DELETE /api/settings/reset-data - Reset all training data (DANGER - org_admin only)
router.delete('/reset-data', authMiddleware(['org_admin', 'admin']), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');

    const user = await traineeRepo.findById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { confirmText } = req.body;

    // Require confirmation text to prevent accidental deletion
    if (confirmText !== 'DELETE ALL DATA') {
      return res.status(400).json({
        error: 'Please confirm by typing "DELETE ALL DATA"',
        required: 'DELETE ALL DATA'
      });
    }

    // Get all trainees in the organization
    const trainees = await prisma.trainee.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    });
    const traineeIds = trainees.map(t => t.id);

    // Delete all training data for the organization's trainees
    // Order matters due to foreign key constraints
    await prisma.$transaction([
      // Delete conversation turns first (depends on simulation sessions)
      prisma.conversationTurn.deleteMany({
        where: { session: { traineeId: { in: traineeIds } } },
      }),
      // Delete interaction reports
      prisma.interactionReport.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
      // Delete simulation sessions
      prisma.simulationSession.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
      // Delete voice sessions
      prisma.voiceSession.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
      // Delete lecture completions
      prisma.lectureCompletion.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
      // Delete assessment completions
      prisma.assessmentCompletion.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
      // Delete notifications
      prisma.notification.deleteMany({
        where: { recipientId: { in: traineeIds } },
      }),
      // Delete notes
      prisma.traineeNote.deleteMany({
        where: { traineeId: { in: traineeIds } },
      }),
    ]);

    // Reset trainee metrics
    await prisma.trainee.updateMany({
      where: { organizationId: user.organizationId },
      data: {
        totalTimeOnPlatform: 0,
        currentStreak: 0,
        currentLevelId: null,
      },
    });

    res.json({
      message: 'All training data has been reset successfully',
      affectedTrainees: traineeIds.length,
    });
  } catch (error) {
    console.error('Error resetting data:', error);
    res.status(500).json({ error: 'Failed to reset training data' });
  }
});

export default router;
