import { Request, Response, NextFunction } from 'express';

export const detectAdBlocker = (req: Request, res: Response, next: NextFunction) => {
  // Simple ad blocker detection via headers
  const userAgent = req.headers['user-agent'] || '';
  const isAdBlockerUA = /adblock|ublock|adguard|ghostery/i.test(userAgent);
  
  // Add to request for analytics
  (req as any).adBlockerDetected = isAdBlockerUA;
  
  next();
};
