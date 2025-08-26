import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { catchAsyncErrors } from './catchAsyncErrors';
import ErrorHandler from '../utils/ErrorHandler';
import { redis } from '../utils/redis';
import SecurityManager from '../security/SecurityManager';

interface AuthenticatedRequest extends Request {
  user?: any;
}

/**
 * Enhanced authentication middleware with security hardening
 */
export const enhancedAuth = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new ErrorHandler('Authentication required', 401));
    }

    try {
      // Check if token is blacklisted
      if (await SecurityManager.isTokenBlacklisted(token)) {
        return next(new ErrorHandler('Token has been revoked', 401));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as JwtPayload;
      
      if (!decoded) {
        return next(new ErrorHandler('Invalid authentication token', 401));
      }

      // Check token age - require refresh after 24 hours
      if (decoded.iat && Date.now() - decoded.iat * 1000 > 24 * 60 * 60 * 1000) {
        return next(new ErrorHandler('Token expired, please refresh', 401));
      }

      // Get user from Redis
      const user = await redis.get(decoded.id);
      if (!user) {
        return next(new ErrorHandler('User session not found', 401));
      }

      const userData = JSON.parse(user);
      
      // Additional security checks
      if (userData.isBlocked || userData.isSuspended) {
        return next(new ErrorHandler('Account has been suspended', 403));
      }

      req.user = userData;
      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return next(new ErrorHandler('Token expired, please login again', 401));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new ErrorHandler('Invalid authentication token', 401));
      }
      return next(new ErrorHandler('Authentication failed', 401));
    }
  }
);

/**
 * Enhanced role authorization with granular permissions
 */
export const enhancedAuthorizeRoles = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ErrorHandler('Authentication required', 401));
    }

    const userRole = req.user.role;
    const userPermissions = req.user.permissions || [];

    // Check role-based access
    if (!roles.includes(userRole)) {
      // Check permission-based access
      const hasPermission = roles.some(role => userPermissions.includes(role));
      if (!hasPermission) {
        return next(new ErrorHandler(`Access denied. Required role: ${roles.join(' or ')}`, 403));
      }
    }

    // Additional checks for kids content access
    if (req.path.includes('/kids') || req.body?.isKidsContent) {
      const userAge = req.user.age || (req.user.dateOfBirth ? 
        new Date().getFullYear() - new Date(req.user.dateOfBirth).getFullYear() : null);
      
      // Restrict adult content access for minors
      if (userAge && userAge < 18 && !req.body?.isKidsContent) {
        return next(new ErrorHandler('Access restricted for minors', 403));
      }
    }

    next();
  };
};

/**
 * Kids Club specific authentication
 */
export const kidsClubAuth = catchAsyncErrors(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // First run standard authentication
    await new Promise<void>((resolve, reject) => {
      enhancedAuth(req, res, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (!req.user) {
      return next(new ErrorHandler('Authentication required for Kids Club', 401));
    }

    // Apply Kids Club specific filtering
    SecurityManager.kidsContentFilter()(req, res, next);
  }
);

/**
 * Parental consent verification for kids under 13
 */
export const parentalConsentRequired = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new ErrorHandler('Authentication required', 401));
  }

  const userAge = req.user.age || (req.user.dateOfBirth ? 
    new Date().getFullYear() - new Date(req.user.dateOfBirth).getFullYear() : null);

  if (userAge && userAge < 13) {
    if (!req.user.parentalConsent || !req.user.parentEmail) {
      return next(new ErrorHandler('Parental consent required for users under 13', 403));
    }

    // Check if parental consent is still valid (yearly renewal)
    const consentDate = new Date(req.user.parentalConsentDate);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (consentDate < oneYearAgo) {
      return next(new ErrorHandler('Parental consent has expired, please renew', 403));
    }
  }

  next();
};
