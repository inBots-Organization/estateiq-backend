import { PrismaClient, Notification } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateNotificationInput {
  recipientId: string;
  senderId?: string;
  type: string;
  title: string;
  message: string;
  priority?: string;
}

export interface BroadcastInput {
  senderId: string;
  recipientIds: string[];
  type: string;
  title: string;
  message: string;
  priority?: string;
}

export class NotificationService {
  /**
   * Create a notification for a user
   */
  async createNotification(input: CreateNotificationInput): Promise<Notification> {
    return prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        senderId: input.senderId,
        type: input.type,
        title: input.title,
        message: input.message,
        priority: input.priority || 'normal',
      },
    });
  }

  /**
   * Send a warning notification to a trainee
   */
  async sendWarning(
    recipientId: string,
    senderId: string,
    title: string,
    message: string
  ): Promise<Notification> {
    return this.createNotification({
      recipientId,
      senderId,
      type: 'warning',
      title,
      message,
      priority: 'high',
    });
  }

  /**
   * Broadcast a notification to multiple users
   */
  async broadcast(input: BroadcastInput): Promise<number> {
    const notifications = input.recipientIds.map((recipientId) => ({
      recipientId,
      senderId: input.senderId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority || 'normal',
    }));

    const result = await prisma.notification.createMany({
      data: notifications,
    });

    return result.count;
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    userId: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ notifications: Notification[]; total: number }> {
    const where: any = { recipientId: userId };

    if (options.unreadOnly) {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total };
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.recipientId !== userId) {
      throw new Error('Not authorized to access this notification');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count;
  }

  /**
   * Delete old read notifications (cleanup utility)
   */
  async deleteOldNotifications(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: cutoffDate },
      },
    });

    return result.count;
  }
}

export const notificationService = new NotificationService();
