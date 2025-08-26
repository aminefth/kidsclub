import express from 'express';
import SecurityManager from '../security/SecurityManager';
import { isAuthenticatedUser, authorizeRoles } from '../middlewares/auth';

const router = express.Router();

/**
 * Security audit endpoint - Admin only
 */
router.get('/audit', 
  SecurityManager.getRateLimiters().api,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const auditResult = await SecurityManager.performSecurityAudit();
      res.status(200).json({
        success: true,
        data: auditResult
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Security audit failed',
        error: error.message
      });
    }
  }
);

/**
 * Security metrics endpoint - Admin only
 */
router.get('/metrics',
  SecurityManager.getRateLimiters().api,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  (req, res) => {
    try {
      const metrics = SecurityManager.getSecurityMetrics();
      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve security metrics',
        error: error.message
      });
    }
  }
);

/**
 * Token blacklist endpoint - for logout/security
 */
router.post('/blacklist-token',
  SecurityManager.getRateLimiters().auth,
  isAuthenticatedUser,
  async (req, res) => {
    try {
      const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        await SecurityManager.blacklistToken(token);
      }
      
      res.status(200).json({
        success: true,
        message: 'Token blacklisted successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Failed to blacklist token',
        error: error.message
      });
    }
  }
);

export default router;
