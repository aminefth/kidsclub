import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { analyticsService } from "../services/analytics.service";

/**
 * @swagger
 * /api/v1/analytics/dashboard:
 *   get:
 *     summary: Get platform analytics dashboard
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics (ISO format)
 *     responses:
 *       200:
 *         description: Analytics data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 analytics:
 *                   type: object
 *       403:
 *         description: Admin access required
 */
export const getDashboardAnalytics = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if user is admin
      if (req.user?.role !== 'admin') {
        return next(new ErrorHandler('Admin access required', 403));
      }

      const { startDate, endDate } = req.query;
      
      // Default to last 30 days if no dates provided
      const end = endDate ? new Date(endDate as string) : new Date();
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const analytics = await analyticsService.getPlatformAnalytics({ start, end });

      res.status(200).json({
        success: true,
        analytics,
        dateRange: { start, end }
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/analytics/user/{userId}:
 *   get:
 *     summary: Get user-specific analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: User analytics retrieved successfully
 *       403:
 *         description: Not authorized to view these analytics
 */
export const getUserAnalytics = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;
      const currentUserId = req.user?._id as string;
      const userRole = req.user?.role;

      // Check if user can access these analytics (own data or admin)
      if (userId !== currentUserId && userRole !== 'admin') {
        return next(new ErrorHandler('Not authorized to view these analytics', 403));
      }

      const end = endDate ? new Date(endDate as string) : new Date();
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const analytics = await analyticsService.getUserAnalytics(userId, { start, end });

      res.status(200).json({
        success: true,
        analytics,
        dateRange: { start, end }
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/analytics/trending:
 *   get:
 *     summary: Get trending content
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Trending content retrieved successfully
 */
export const getTrendingContent = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit = 10 } = req.query;
      const limitNum = Math.min(parseInt(limit as string), 50);

      const trending = await analyticsService.getTrendingContent(limitNum);

      res.status(200).json({
        success: true,
        trending,
        message: 'Trending content retrieved successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/analytics/track/view:
 *   post:
 *     summary: Track a page view
 *     tags: [Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blogId
 *             properties:
 *               blogId:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: View tracked successfully
 */
export const trackPageView = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { blogId, metadata } = req.body;
      const userId = req.user?._id as string;

      await analyticsService.trackPageView(blogId, userId, metadata);

      res.status(200).json({
        success: true,
        message: 'View tracked successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/analytics/my-stats:
 *   get:
 *     summary: Get current user's analytics summary
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User stats retrieved successfully
 */
export const getMyStats = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id as string;
      
      // Get last 30 days analytics
      const end = new Date();
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const analytics = await analyticsService.getUserAnalytics(userId, { start, end });

      res.status(200).json({
        success: true,
        stats: analytics,
        message: 'Your analytics retrieved successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
