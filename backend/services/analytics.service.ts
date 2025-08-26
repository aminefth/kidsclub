import BlogModel from "../models/blogs.model";
import UserModel from "../models/user.model";
import CommentModel from "../models/comment.model";
// import { AdAnalyticsModel } from '../models/adAnalytics.model'; // Commented out - not needed for core analytics
import { redis } from "../utils/redis";

export interface AnalyticsData {
  totalUsers: number;
  totalBlogs: number;
  totalComments: number;
  totalViews: number;
  totalRevenue: number;
  dailyActiveUsers: number;
  topCategories: Array<{ category: string; count: number }>;
  topAuthors: Array<{ author: string; views: number; blogs: number }>;
  recentActivity: Array<{ type: string; count: number; date: string }>;
  userGrowth: Array<{ date: string; users: number }>;
  contentEngagement: {
    averageViews: number;
    averageComments: number;
    averageReactions: number;
  };
}

export interface UserAnalytics {
  userId: string;
  totalViews: number;
  totalComments: number;
  totalReactions: number;
  blogsPublished: number;
  followersGained: number;
  engagementRate: number;
  topCategories: string[];
  recentActivity: Array<{ action: string; timestamp: Date; details: any }>;
}

class AnalyticsService {
  private cacheKey = "analytics:dashboard";
  private cacheExpiry = 300; // 5 minutes

  /**
   * Get comprehensive platform analytics
   */
  async getPlatformAnalytics(dateRange: { start: Date; end: Date }): Promise<AnalyticsData> {
    try {
      // Check cache first
      const cached = await redis.get(this.cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }

      const { start, end } = dateRange;

      // Parallel queries for better performance
      const [
        totalUsers,
        totalBlogs,
        totalComments,
        totalViews,
        totalRevenue,
        dailyActiveUsers,
        topCategories,
        topAuthors,
        recentActivity,
        userGrowth,
        contentEngagement
      ] = await Promise.all([
        this.getTotalUsers(),
        this.getTotalBlogs(start, end),
        this.getTotalComments(start, end),
        this.getTotalViews(start, end),
        this.getTotalRevenue(start, end),
        this.getDailyActiveUsers(),
        this.getTopCategories(start, end),
        this.getTopAuthors(start, end),
        this.getRecentActivity(start, end),
        this.getUserGrowth(start, end),
        this.getContentEngagement(start, end)
      ]);

      const analytics: AnalyticsData = {
        totalUsers,
        totalBlogs,
        totalComments,
        totalViews,
        totalRevenue,
        dailyActiveUsers,
        topCategories,
        topAuthors,
        recentActivity,
        userGrowth,
        contentEngagement
      };

      // Cache the results
      await redis.setex(this.cacheKey, this.cacheExpiry, JSON.stringify(analytics));

      return analytics;
    } catch (error) {
      console.error('Error getting platform analytics:', error);
      throw error;
    }
  }

  /**
   * Get user-specific analytics
   */
  async getUserAnalytics(userId: string, dateRange: { start: Date; end: Date }): Promise<UserAnalytics> {
    try {
      const { start, end } = dateRange;

      const [
        userBlogs,
        userComments,
        userFollowers,
        userActivity
      ] = await Promise.all([
        BlogModel.find({ 
          author: userId,
          createdAt: { $gte: start, $lte: end }
        }),
        CommentModel.find({ 
          author: userId,
          createdAt: { $gte: start, $lte: end }
        }),
        UserModel.findById(userId).select('followers following'),
        this.getUserActivity(userId, start, end)
      ]);

      // Calculate metrics
      const totalViews = userBlogs.reduce((sum, blog) => sum + (blog.activity?.total_likes || 0), 0);
      const totalComments = userComments.length;
      const totalReactions = userBlogs.reduce((sum, blog) => 
        sum + (blog.activity?.total_reads || 0), 0
      );
      const blogsPublished = userBlogs.length;
      const followersGained = userFollowers?.followers?.length || 0;

      // Calculate engagement rate
      const engagementRate = totalViews > 0 
        ? ((totalComments + totalReactions) / totalViews) * 100 
        : 0;

      // Get top categories
      const categoryCount: { [key: string]: number } = {};
      userBlogs.forEach(blog => {
        if (blog.category) {
          categoryCount[blog.category] = (categoryCount[blog.category] || 0) + 1;
        }
      });
      const topCategories = Object.entries(categoryCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([category]) => category);

      return {
        userId,
        totalViews,
        totalComments,
        totalReactions,
        blogsPublished,
        followersGained,
        engagementRate: Math.round(engagementRate * 100) / 100,
        topCategories,
        recentActivity: userActivity
      };
    } catch (error) {
      console.error('Error getting user analytics:', error);
      throw error;
    }
  }

  /**
   * Track page view
   */
  async trackPageView(blogId: string, userId?: string, metadata?: any) {
    try {
      // Update blog view count
      await BlogModel.findByIdAndUpdate(blogId, {
        $inc: { 'activity.total_views': 1 }
      });

      // Track in Redis for real-time analytics
      const today = new Date().toISOString().split('T')[0];
      await redis.hincrby(`views:${today}`, blogId, 1);

      // Track user activity if logged in
      if (userId) {
        await this.trackUserActivity(userId, 'view', { blogId, ...metadata });
      }
    } catch (error) {
      console.error('Error tracking page view:', error);
    }
  }

  /**
   * Track user activity
   */
  async trackUserActivity(userId: string, action: string, details: any) {
    try {
      const activity = {
        action,
        timestamp: new Date(),
        details
      };

      // Store in Redis with expiry (30 days)
      const key = `user_activity:${userId}`;
      await redis.lpush(key, JSON.stringify(activity));
      await redis.ltrim(key, 0, 999); // Keep last 1000 activities
      await redis.expire(key, 30 * 24 * 60 * 60); // 30 days
    } catch (error) {
      console.error('Error tracking user activity:', error);
    }
  }

  /**
   * Get trending content
   */
  async getTrendingContent(limit: number = 10) {
    try {
      const cacheKey = `trending:content:${limit}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }

      // Get blogs with highest engagement in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const trending = await BlogModel.aggregate([
        {
          $match: {
            createdAt: { $gte: sevenDaysAgo },
            isPublished: true
          }
        },
        {
          $addFields: {
            engagementScore: {
              $add: [
                { $multiply: ['$activity.total_views', 1] },
                { $multiply: ['$activity.total_comments', 5] },
                { $multiply: ['$activity.total_reactions', 3] }
              ]
            }
          }
        },
        {
          $sort: { engagementScore: -1 }
        },
        {
          $limit: limit
        },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'author'
          }
        },
        {
          $unwind: '$author'
        },
        {
          $project: {
            title: 1,
            slug: 1,
            category: 1,
            'author.name': 1,
            'author.avatar': 1,
            'activity.total_views': 1,
            'activity.total_comments': 1,
            'activity.total_reactions': 1,
            engagementScore: 1,
            createdAt: 1
          }
        }
      ]);

      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(trending));

      return trending;
    } catch (error) {
      console.error('Error getting trending content:', error);
      throw error;
    }
  }

  // Private helper methods
  private async getTotalUsers(): Promise<number> {
    return await UserModel.countDocuments();
  }

  private async getTotalBlogs(start: Date, end: Date): Promise<number> {
    return await BlogModel.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
  }

  private async getTotalComments(start: Date, end: Date): Promise<number> {
    return await CommentModel.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
  }

  private async getTotalViews(start: Date, end: Date): Promise<number> {
    const result = await BlogModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$activity.total_views' }
        }
      }
    ]);
    return result[0]?.totalViews || 0;
  }

  private async getTotalRevenue(start: Date, end: Date): Promise<number> {
    // Revenue calculation temporarily disabled - AdAnalytics model needs cleanup
    return 0;
  }

  private async getDailyActiveUsers(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const activeUsers = await redis.scard(`active_users:${today}`);
    return activeUsers || 0;
  }

  private async getTopCategories(start: Date, end: Date): Promise<Array<{ category: string; count: number }>> {
    return await BlogModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          category: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);
  }

  private async getTopAuthors(start: Date, end: Date): Promise<Array<{ author: string; views: number; blogs: number }>> {
    return await BlogModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$author',
          views: { $sum: '$activity.total_views' },
          blogs: { $sum: 1 }
        }
      },
      {
        $sort: { views: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      {
        $unwind: '$authorInfo'
      },
      {
        $project: {
          author: '$authorInfo.name',
          views: 1,
          blogs: 1,
          _id: 0
        }
      }
    ]);
  }

  private async getRecentActivity(start: Date, end: Date): Promise<Array<{ type: string; count: number; date: string }>> {
    const activities = [];
    
    // Get daily blog posts
    const blogActivity = await BlogModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          type: { $literal: "blogs" },
          date: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    // Get daily comments
    const commentActivity = await CommentModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          type: { $literal: "comments" },
          date: '$_id',
          count: 1,
          _id: 0
        }
      }
    ]);

    activities.push(...blogActivity, ...commentActivity);
    return activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  private async getUserGrowth(start: Date, end: Date): Promise<Array<{ date: string; users: number }>> {
    return await UserModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          users: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      },
      {
        $project: {
          date: '$_id',
          users: 1,
          _id: 0
        }
      }
    ]);
  }

  private async getContentEngagement(start: Date, end: Date): Promise<{ averageViews: number; averageComments: number; averageReactions: number }> {
    const result = await BlogModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          averageViews: { $avg: '$activity.total_views' },
          averageComments: { $avg: '$activity.total_comments' },
          averageReactions: { $avg: '$activity.total_reactions' }
        }
      }
    ]);

    const data = result[0] || { averageViews: 0, averageComments: 0, averageReactions: 0 };
    return {
      averageViews: Math.round(data.averageViews * 100) / 100,
      averageComments: Math.round(data.averageComments * 100) / 100,
      averageReactions: Math.round(data.averageReactions * 100) / 100
    };
  }

  private async getUserActivity(userId: string, start: Date, end: Date): Promise<Array<{ action: string; timestamp: Date; details: any }>> {
    try {
      const key = `user_activity:${userId}`;
      const activities = await redis.lrange(key, 0, 99); // Get last 100 activities
      
      return activities
        .map(activity => JSON.parse(activity))
        .filter(activity => {
          const timestamp = new Date(activity.timestamp);
          return timestamp >= start && timestamp <= end;
        })
        .slice(0, 20); // Return last 20 activities in date range
    } catch (error) {
      console.error('Error getting user activity:', error);
      return [];
    }
  }
}

export const analyticsService = new AnalyticsService();
