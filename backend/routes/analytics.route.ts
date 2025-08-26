import express from "express";
import { 
  getDashboardAnalytics,
  getUserAnalytics,
  getTrendingContent,
  trackPageView,
  getMyStats
} from "../controllers/analytics.controller";
import { isAuthenticatedUser, authorizeRoles } from "../middlewares/auth";
import { validateRequest } from "../middlewares/validation";
import { body, param, query } from "express-validator";

const analyticsRouter = express.Router();

// Validation rules
const dateValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be in ISO format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be in ISO format')
];

const trackViewValidation = [
  body('blogId')
    .isMongoId()
    .withMessage('Invalid blog ID'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

// Routes
analyticsRouter.get(
  "/dashboard",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  dateValidation,
  validateRequest,
  getDashboardAnalytics
);

analyticsRouter.get(
  "/user/:userId",
  isAuthenticatedUser,
  param('userId').isMongoId().withMessage('Invalid user ID'),
  dateValidation,
  validateRequest,
  getUserAnalytics
);

analyticsRouter.get(
  "/trending",
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  validateRequest,
  getTrendingContent
);

analyticsRouter.post(
  "/track/view",
  trackViewValidation,
  validateRequest,
  trackPageView
);

analyticsRouter.get(
  "/my-stats",
  isAuthenticatedUser,
  getMyStats
);

export default analyticsRouter;
