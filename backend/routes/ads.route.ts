import express from 'express';
import { 
  getSponsoredContent,
  trackAdImpression,
  trackAdClick,
  getRevenueData,
  getOptimalAd,
  createAdCampaign,
  getAdCampaigns,
  updateAdCampaign,
  getAdAnalytics
} from '../controllers/ads.controller';
import { authorizeRoles, isAuthenticatedUser } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimite';

const adsRouter = express.Router();

// Public routes (for displaying ads)
adsRouter.get('/sponsored', getSponsoredContent);
adsRouter.get('/optimal', getOptimalAd);

// Analytics tracking routes
adsRouter.post('/track/impression', trackAdImpression);
adsRouter.post('/track/click', trackAdClick);

// Admin/Revenue routes
adsRouter.get('/revenue', 
  authLimiter,
  isAuthenticatedUser, 
  authorizeRoles('admin'), 
  getRevenueData
);

adsRouter.get('/analytics',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  getAdAnalytics
);

// Campaign management routes
adsRouter.post('/campaigns',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  createAdCampaign
);

adsRouter.get('/campaigns',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  getAdCampaigns
);

adsRouter.put('/campaigns/:id',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  updateAdCampaign
);

export default adsRouter;
