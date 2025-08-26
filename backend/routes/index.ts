import express from 'express';
import { Request, Response, NextFunction } from 'express';

// Import existing routes (fixed paths)
import userRoutes from './user.route';
import blogRoutes from './blog.route';
import commentRoutes from './comments.route';
import notificationRoutes from './notification.route';
import adsRoutes from './ads.route';
import analyticsRoutes from './analytics.route';
import healthRoutes from './health.route';

// Import new documented routes
import authRoutes from './auth.routes';
import healthRoutesDocumented from './health.routes';
import blogRoutesDocumented from './blog.routes.documented';

const router = express.Router();

/**
 * Professional API Route Organization
 * Organized with health checks and proper versioning
 */

// Health checks (no versioning - used by load balancers/monitoring)
router.use('/', healthRoutes);

// API status endpoint
router.get('/api', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'KidsClub API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      blogs: '/api/v1/blogs', 
      comments: '/api/v1/comments',
      notifications: '/api/v1/notifications',
      ads: '/api/v1/ads',
      analytics: '/api/v1/analytics'
    }
  });
});

// API v1 routes (organized and professional)
router.use('/api/v1', userRoutes);
router.use('/api/v1', blogRoutes);
router.use('/api/v1', notificationRoutes);
router.use('/api/v1', adsRoutes);
router.use('/api/v1/comments', commentRoutes);
router.use('/api/v1/analytics', analyticsRoutes);

// Import Swagger documentation routes for OpenAPI spec
import swaggerRoutes from './swagger.routes';
router.use('/', swaggerRoutes);

export default router;
