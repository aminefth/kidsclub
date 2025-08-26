import { Response } from 'express';
import { ApiResponse, WithPagination, PaginationMeta } from '../types/api.types';
import { randomUUID } from 'crypto';

/**
 * Professional response utilities for consistent API responses
 * Enterprise-grade response formatting and error handling
 */

export class ResponseUtil {
  /**
   * Send successful response with data
   */
  static success<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('x-request-id') as string || randomUUID(),
        version: '1.0.0'
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send successful response with paginated data
   */
  static successWithPagination<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    message?: string,
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<WithPagination<T>> = {
      success: true,
      data: {
        data,
        pagination
      },
      message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('x-request-id') as string || randomUUID(),
        version: '1.0.0',
        pagination
      }
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    error?: any
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('x-request-id') as string || randomUUID(),
        version: '1.0.0'
      }
    };

    // Add error details in development
    if (process.env.NODE_ENV === 'development' && error) {
      (response as any).details = {
        stack: error.stack,
        name: error.name
      };
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send validation error response
   */
  static validationError(
    res: Response,
    errors: Array<{ field: string; message: string }>,
    message: string = 'Validation failed'
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: message,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: res.getHeader('x-request-id') as string || randomUUID(),
        version: '1.0.0'
      }
    };

    (response as any).validationErrors = errors;

    return res.status(400).json(response);
  }

  /**
   * Send unauthorized response
   */
  static unauthorized(
    res: Response,
    message: string = 'Unauthorized access'
  ): Response {
    return this.error(res, message, 401);
  }

  /**
   * Send forbidden response
   */
  static forbidden(
    res: Response,
    message: string = 'Access forbidden'
  ): Response {
    return this.error(res, message, 403);
  }

  /**
   * Send not found response
   */
  static notFound(
    res: Response,
    message: string = 'Resource not found'
  ): Response {
    return this.error(res, message, 404);
  }

  /**
   * Send conflict response
   */
  static conflict(
    res: Response,
    message: string = 'Resource conflict'
  ): Response {
    return this.error(res, message, 409);
  }

  /**
   * Send rate limit exceeded response
   */
  static rateLimitExceeded(
    res: Response,
    message: string = 'Rate limit exceeded'
  ): Response {
    return this.error(res, message, 429);
  }

  /**
   * Calculate pagination metadata
   */
  static calculatePagination(
    page: number,
    limit: number,
    total: number
  ): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    
    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  }
}

/**
 * Async error handler wrapper for controllers
 */
export const asyncHandler = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Professional error classes
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public validationErrors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string }> = []
  ) {
    super(message, 400, 'VALIDATION_ERROR');
    this.validationErrors = validationErrors;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}
