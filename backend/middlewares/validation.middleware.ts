import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError, ErrorResponse, AuthenticatedRequest } from '../types/api.types';
import { randomUUID } from 'crypto';

/**
 * Professional validation middleware using Zod
 * Enterprise-grade input validation with detailed error responses
 */

export interface ValidationOptions {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  headers?: z.ZodSchema;
  stripUnknown?: boolean;
  abortEarly?: boolean;
}

/**
 * Main validation middleware factory
 */
export const validate = (options: ValidationOptions) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];
    const requestId = req.headers['x-request-id'] as string || randomUUID();

    try {
      // Validate request body
      if (options.body) {
        const result = options.body.safeParse(req.body);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'body'));
        } else {
          req.body = result.data;
        }
      }

      // Validate query parameters
      if (options.query) {
        const result = options.query.safeParse(req.query);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'query'));
        } else {
          req.query = result.data as any;
        }
      }

      // Validate route parameters
      if (options.params) {
        const result = options.params.safeParse(req.params);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'params'));
        } else {
          req.params = result.data as any;
        }
      }

      // Validate headers
      if (options.headers) {
        const result = options.headers.safeParse(req.headers);
        if (!result.success) {
          errors.push(...formatZodErrors(result.error, 'headers'));
        }
      }

      // Return validation errors if any
      if (errors.length > 0) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: 'Validation failed',
          details: errors,
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
          requestId
        };

        return res.status(400).json(errorResponse);
      }

      next();
    } catch (error) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Internal validation error',
        code: 'VALIDATION_INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        requestId
      };

      return res.status(500).json(errorResponse);
    }
  };
};

/**
 * Format Zod validation errors into our standard format
 */
const formatZodErrors = (error: z.ZodError, location: string) => {
  return error.issues.map((err: any) => ({
    field: `${location}.${err.path.join('.')}`,
    message: err.message,
    code: err.code,
    received: err.received
  }));
}

/**
 * Common validation schemas for reuse
 */
export const CommonValidations = {
  // MongoDB ObjectId validation
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),
  
  // Pagination parameters
  pagination: z.object({
    page: z.coerce.number().min(1, 'Page must be at least 1').default(1),
    limit: z.coerce.number().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(10),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc')
  }),

  // Date range validation
  dateRange: z.object({
    startDate: z.string().datetime('Invalid start date format'),
    endDate: z.string().datetime('Invalid end date format')
  }).refine(data => new Date(data.startDate) < new Date(data.endDate), {
    message: 'Start date must be before end date',
    path: ['endDate']
  }),

  // Search parameters
  search: z.object({
    q: z.string().min(1, 'Search query is required').max(100, 'Search query too long'),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().regex(/^[0-9a-fA-F]{24}$/).optional()
  }),

  // File upload validation
  fileUpload: z.object({
    filename: z.string().min(1, 'Filename is required'),
    mimetype: z.string().regex(/^(image|video|document)\//i, 'Invalid file type'),
    size: z.number().max(10 * 1024 * 1024, 'File size cannot exceed 10MB')
  })
};

/**
 * Sanitization middleware
 */
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize string inputs
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  
  next();
};

/**
 * Rate limiting validation
 */
export const validateRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean up old entries
    for (const [key, value] of requests.entries()) {
      if (value.resetTime < windowStart) {
        requests.delete(key);
      }
    }

    // Check current client
    const clientData = requests.get(clientId) || { count: 0, resetTime: now + windowMs };
    
    if (clientData.resetTime < now) {
      clientData.count = 0;
      clientData.resetTime = now + windowMs;
    }

    clientData.count++;
    requests.set(clientId, clientData);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - clientData.count));
    res.setHeader('X-RateLimit-Reset', new Date(clientData.resetTime).toISOString());

    if (clientData.count > maxRequests) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || randomUUID()
      };

      return res.status(429).json(errorResponse);
    }

    next();
  };
};

/**
 * Content-Type validation middleware
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'];
    
    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: `Invalid content type. Allowed types: ${allowedTypes.join(', ')}`,
        code: 'INVALID_CONTENT_TYPE',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || randomUUID()
      };

      return res.status(415).json(errorResponse);
    }

    next();
  };
};

/**
 * Request size validation middleware
 */
export const validateRequestSize = (maxSize: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: `Request too large. Maximum size: ${maxSize} bytes`,
        code: 'REQUEST_TOO_LARGE',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] as string || randomUUID()
      };

      return res.status(413).json(errorResponse);
    }

    next();
  };
};
