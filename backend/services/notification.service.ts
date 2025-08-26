import NotificationModel, { INotification } from "../models/notification.model";
import UserModel from "../models/user.model";
import { realtimeService } from "../server";
import { redis } from "../utils/redis";

export interface NotificationData {
  recipient: string;
  sender?: string;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'blog_published' | 'system';
  title: string;
  message: string;
  data?: any;
}

class NotificationService {
  /**
   * Create and send a notification
   */
  async createNotification(notificationData: NotificationData): Promise<INotification> {
    try {
      const notification = new NotificationModel(notificationData);
      await notification.save();

      // Populate sender information
      if (notification.sender) {
        await notification.populate('sender', 'name avatar');
      }

      // Send real-time notification
      realtimeService.emitNotification(notification.recipient as string, notification);

      // Update user's unread notification count
      await this.updateUnreadCount(notification.recipient as string);

      // Cache notification for quick access
      await this.cacheNotification(notification);

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(
    userId: string, 
    page: number = 1, 
    limit: number = 20,
    unreadOnly: boolean = false
  ) {
    try {
      const query: any = { recipient: userId };
      if (unreadOnly) {
        query.isRead = false;
      }

      const notifications = await NotificationModel.find(query)
        .populate('sender', 'name avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

      const total = await NotificationModel.countDocuments(query);

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notification = await NotificationModel.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { isRead: true },
        { new: true }
      );

      if (notification) {
        // Update unread count
        await this.updateUnreadCount(userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await NotificationModel.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true }
      );

      // Update unread count to 0
      await redis.set(`unread_notifications:${userId}`, '0');

      return result.modifiedCount;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await NotificationModel.deleteOne({
        _id: notificationId,
        recipient: userId
      });

      if (result.deletedCount > 0) {
        await this.updateUnreadCount(userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      // Try to get from cache first
      const cached = await redis.get(`unread_notifications:${userId}`);
      if (cached !== null && cached !== undefined) {
        return parseInt(cached as string);
      }

      // If not cached, count from database
      const count = await NotificationModel.countDocuments({
        recipient: userId,
        isRead: false
      });

      // Cache the count
      await redis.setex(`unread_notifications:${userId}`, 300, count.toString());

      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Send notification for new blog post to followers
   */
  async notifyFollowersOfNewBlog(authorId: string, blogTitle: string, blogId: string) {
    try {
      const author = await UserModel.findById(authorId).select('name followers');
      if (!author?.name || !author.followers?.length) return;

      // Create notifications individually to get proper IDs
      for (const followerId of author.followers) {
        await this.createNotification({
          recipient: followerId.toString(),
          sender: authorId,
          type: 'blog_published',
          title: 'New Blog Post',
          message: `${author.name} published a new blog: "${blogTitle}"`,
          data: { blogId, blogTitle }
        });
      }

      // Unread counts are updated automatically in createNotification
    } catch (error) {
      console.error('Error notifying followers of new blog:', error);
    }
  }

  /**
   * Send notification for new comment
   */
  async notifyOfNewComment(
    blogAuthorId: string, 
    commentAuthorId: string, 
    blogTitle: string, 
    blogId: string
  ) {
    try {
      // Don't notify if commenting on own blog
      if (blogAuthorId === commentAuthorId) return;

      const commentAuthor = await UserModel.findById(commentAuthorId).select('name');
      if (!commentAuthor) return;

      await this.createNotification({
        recipient: blogAuthorId,
        sender: commentAuthorId,
        type: 'comment',
        title: 'New Comment',
        message: `${commentAuthor.name} commented on your blog: "${blogTitle}"`,
        data: { blogId, blogTitle }
      });
    } catch (error) {
      console.error('Error notifying of new comment:', error);
    }
  }

  /**
   * Send notification for new follower
   */
  async notifyOfNewFollower(userId: string, followerId: string) {
    try {
      const follower = await UserModel.findById(followerId).select('name');
      if (!follower) return;

      await this.createNotification({
        recipient: userId,
        sender: followerId,
        type: 'follow',
        title: 'New Follower',
        message: `${follower.name} started following you`,
        data: { followerId }
      });
    } catch (error) {
      console.error('Error notifying of new follower:', error);
    }
  }

  /**
   * Send notification for blog reaction
   */
  async notifyOfBlogReaction(
    blogAuthorId: string, 
    reactorId: string, 
    reactionType: string,
    blogTitle: string,
    blogId: string
  ) {
    try {
      // Don't notify if reacting to own blog
      if (blogAuthorId === reactorId) return;

      const reactor = await UserModel.findById(reactorId).select('name');
      if (!reactor) return;

      await this.createNotification({
        recipient: blogAuthorId,
        sender: reactorId,
        type: 'like',
        title: 'Blog Reaction',
        message: `${reactor.name} ${reactionType}d your blog: "${blogTitle}"`,
        data: { blogId, blogTitle, reactionType }
      });
    } catch (error) {
      console.error('Error notifying of blog reaction:', error);
    }
  }

  /**
   * Send system notification
   */
  async sendSystemNotification(
    recipients: string[], 
    title: string, 
    message: string, 
    data?: any
  ) {
    try {
      // Create notifications individually
      for (const recipient of recipients) {
        await this.createNotification({
          recipient,
          type: 'system',
          title,
          message,
          data
        });
      }
    } catch (error) {
      console.error('Error sending system notification:', error);
    }
  }

  /**
   * Clean up old notifications (older than 30 days)
   */
  async cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await NotificationModel.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        isRead: true
      });

      console.log(`Cleaned up ${result.deletedCount} old notifications`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return 0;
    }
  }

  // Private helper methods
  private async updateUnreadCount(userId: string) {
    try {
      const count = await NotificationModel.countDocuments({
        recipient: userId,
        isRead: false
      });

      await redis.setex(`unread_notifications:${userId}`, 300, count.toString());
    } catch (error) {
      console.error('Error updating unread count:', error);
    }
  }

  private async cacheNotification(notification: INotification) {
    try {
      const key = `recent_notifications:${notification.recipient}`;
      await redis.lpush(key, JSON.stringify(notification));
      await redis.ltrim(key, 0, 49); // Keep last 50 notifications
      await redis.expire(key, 24 * 60 * 60); // 24 hours
    } catch (error) {
      console.error('Error caching notification:', error);
    }
  }
}

export const notificationService = new NotificationService();
