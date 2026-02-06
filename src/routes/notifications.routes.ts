import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { orgIsolationMiddleware, trainerAccessMiddleware } from '../middleware/rbac.middleware';
import { notificationService } from '../services/notification/notification.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware());
router.use(orgIsolationMiddleware());

/**
 * GET /api/notifications
 * Get notifications for the current user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { user } = req;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await notificationService.getNotifications(user.userId, {
      unreadOnly,
      limit,
      offset,
    });

    return res.json(result);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const { user } = req;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await notificationService.getUnreadCount(user.userId);

    return res.json({ count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const { user } = req;
    const { id } = req.params;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notification = await notificationService.markAsRead(id, user.userId);

    return res.json({ notification });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    if (error.message === 'Notification not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('authorized')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read
 */
router.post('/mark-all-read', async (req: Request, res: Response) => {
  try {
    const { user } = req;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const count = await notificationService.markAllAsRead(user.userId);

    return res.json({ success: true, marked: count });
  } catch (error) {
    console.error('Error marking all as read:', error);
    return res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

/**
 * POST /api/notifications/send-warning
 * Send a warning to a trainee (trainer or org_admin)
 */
router.post(
  '/send-warning',
  authMiddleware(['trainer', 'org_admin']),
  trainerAccessMiddleware(),
  async (req: Request, res: Response) => {
    try {
      const { user, organizationId } = req;
      const { traineeId, title, message } = req.body;

      if (!user || !organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!traineeId || !title || !message) {
        return res.status(400).json({ error: 'traineeId, title, and message are required' });
      }

      // Verify trainee exists in same organization
      const trainee = await prisma.trainee.findFirst({
        where: { id: traineeId, organizationId },
      });

      if (!trainee) {
        return res.status(404).json({ error: 'Trainee not found' });
      }

      const notification = await notificationService.sendWarning(
        traineeId,
        user.userId,
        title,
        message
      );

      return res.status(201).json({ notification });
    } catch (error) {
      console.error('Error sending warning:', error);
      return res.status(500).json({ error: 'Failed to send warning' });
    }
  }
);

/**
 * POST /api/notifications/broadcast
 * Send a notification to multiple users (org_admin only)
 */
router.post(
  '/broadcast',
  authMiddleware(['org_admin']),
  async (req: Request, res: Response) => {
    try {
      const { user, organizationId } = req;
      const { recipientIds, title, message, type = 'announcement', priority } = req.body;

      if (!user || !organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!title || !message) {
        return res.status(400).json({ error: 'title and message are required' });
      }

      let targetIds = recipientIds;

      // If no recipient IDs provided, send to all trainees in organization
      if (!recipientIds || recipientIds.length === 0) {
        const trainees = await prisma.trainee.findMany({
          where: {
            organizationId,
            role: 'trainee',
            status: 'active',
          },
          select: { id: true },
        });
        targetIds = trainees.map((t) => t.id);
      } else {
        // Verify all recipients are in the same organization
        const validRecipients = await prisma.trainee.findMany({
          where: {
            id: { in: recipientIds },
            organizationId,
          },
          select: { id: true },
        });
        targetIds = validRecipients.map((t) => t.id);
      }

      if (targetIds.length === 0) {
        return res.status(400).json({ error: 'No valid recipients found' });
      }

      const count = await notificationService.broadcast({
        senderId: user.userId,
        recipientIds: targetIds,
        type,
        title,
        message,
        priority,
      });

      return res.status(201).json({
        success: true,
        message: `Notification sent to ${count} users`,
        count,
      });
    } catch (error) {
      console.error('Error broadcasting notification:', error);
      return res.status(500).json({ error: 'Failed to broadcast notification' });
    }
  }
);

export default router;
