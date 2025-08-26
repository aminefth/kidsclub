import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../library/logger';

/**
 * Request logging middleware for professional API monitoring
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || randomUUID();
  
  // Add request ID to headers for tracing
  req.headers['x-request-id'] = requestId as string;
  res.setHeader('x-request-id', requestId);

  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Log response when request completes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  });

  next();
};

/**
 * Error request logger
 */
export const errorLogger = (error: Error, req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'];
  
  logger.error('Request error', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  next(error);
};
