import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult, ValidationChain } from 'express-validator';
import winston from 'winston';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { redis } from '../utils/redis';

interface SecurityAuditResult {
  passed: boolean;
  score: number;
  vulnerabilities: SecurityVulnerability[];
  recommendations: string[];
  timestamp: Date;
}

interface SecurityVulnerability {
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string;
  remediation: string;
}

interface SecurityMetrics {
  totalRequests: number;
  blockedRequests: number;
  suspiciousActivity: number;
  failedLogins: number;
  rateLimitHits: number;
}

export class SecurityManager {
  private static instance: SecurityManager;
  private metrics: SecurityMetrics;
  private logger: winston.Logger;
  private blacklistedTokens: Set<string> = new Set();

  private constructor() {
    this.metrics = {
      totalRequests: 0,
      blockedRequests: 0,
      suspiciousActivity: 0,
      failedLogins: 0,
      rateLimitHits: 0
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'security-manager' },
      transports: [
        new winston.transports.File({ filename: 'logs/security-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/security-combined.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  public static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  /**
   * Enhanced Helmet configuration for platform security
   */
  public getHelmetConfig() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:", "blob:"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
          blockAllMixedContent: []
        }
      },
      crossOriginEmbedderPolicy: false, // Allow embedding for educational content
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" }
    });
  }

  /**
   * Advanced rate limiting configurations for different endpoints
   */
  public getRateLimiters() {
    return {
      // Authentication endpoints - strict limits
      auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts per window
        message: {
          error: 'Too many authentication attempts',
          retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          this.metrics.rateLimitHits++;
          this.logSecurityEvent('rate_limit_exceeded', req, 'Authentication rate limit exceeded');
          res.status(429).json({
            success: false,
            error: 'Too many authentication attempts',
            retryAfter: '15 minutes'
          });
        }
      }),

      // API endpoints - moderate limits
      api: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // 100 requests per window
        message: {
          error: 'Too many API requests',
          retryAfter: '15 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          this.metrics.rateLimitHits++;
          this.logSecurityEvent('api_rate_limit', req, 'API rate limit exceeded');
          res.status(429).json({
            success: false,
            error: 'Too many API requests',
            retryAfter: '15 minutes'
          });
        }
      }),

      // Kids Club content - special limits
      kidsContent: rateLimit({
        windowMs: 10 * 60 * 1000, // 10 minutes
        max: 50, // 50 requests per window for kids content
        message: {
          error: 'Please take a break and try again later',
          retryAfter: '10 minutes'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          this.metrics.rateLimitHits++;
          this.logSecurityEvent('kids_rate_limit', req, 'Kids content rate limit exceeded');
          res.status(429).json({
            success: false,
            error: 'Please take a break and try again later',
            retryAfter: '10 minutes'
          });
        }
      }),

      // File upload - very strict
      upload: rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 10, // 10 uploads per hour
        message: {
          error: 'Upload limit exceeded',
          retryAfter: '1 hour'
        },
        standardHeaders: true,
        legacyHeaders: false
      })
    };
  }

  /**
   * Comprehensive input sanitization
   */
  public sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Remove potential XSS vectors
      return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:text\/html/gi, '')
        .trim();
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }

    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[this.sanitizeInput(key)] = this.sanitizeInput(value);
      }
      return sanitized;
    }

    return input;
  }

  /**
   * JWT security hardening
   */
  public async blacklistToken(token: string): Promise<void> {
    this.blacklistedTokens.add(token);
    // Store in Redis with expiration
    await redis.setex(`blacklist:${token}`, 24 * 60 * 60, 'true'); // 24 hours
  }

  public async isTokenBlacklisted(token: string): Promise<boolean> {
    if (this.blacklistedTokens.has(token)) {
      return true;
    }
    const blacklisted = await redis.get(`blacklist:${token}`);
    return blacklisted === 'true';
  }

  /**
   * Enhanced JWT validation middleware
   */
  public validateJWT() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }

        // Check if token is blacklisted
        if (await this.isTokenBlacklisted(token)) {
          return res.status(401).json({
            success: false,
            message: 'Token has been revoked'
          });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN as string) as any;
        
        // Additional security checks
        if (decoded.iat && Date.now() - decoded.iat * 1000 > 24 * 60 * 60 * 1000) {
          // Token older than 24 hours, require refresh
          return res.status(401).json({
            success: false,
            message: 'Token expired, please refresh'
          });
        }

        // Get user from Redis
        const user = await redis.get(decoded.id);
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'User session not found'
          });
        }

        req.user = JSON.parse(user);
        next();
      } catch (error) {
        this.logSecurityEvent('jwt_validation_failed', req, `JWT validation failed: ${error}`);
        return res.status(401).json({
          success: false,
          message: 'Invalid authentication token'
        });
      }
    };
  }

  /**
   * Kids Club content filtering middleware
   */
  public kidsContentFilter() {
    return (req: Request, res: Response, next: NextFunction) => {
      const userAge = req.user?.age || req.user?.dateOfBirth;
      const isKidsContent = req.path.includes('/kids') || req.body?.isKidsContent;

      if (isKidsContent && userAge) {
        const age = this.calculateAge(userAge);
        
        // Age-based content restrictions
        if (age < 6) {
          req.body.ageGroup = 'kids-0-5';
        } else if (age < 9) {
          req.body.ageGroup = 'kids-6-8';
        } else if (age < 13) {
          req.body.ageGroup = 'kids-9-12';
        } else if (age < 17) {
          req.body.ageGroup = 'kids-13-16';
        }

        // Additional safety checks for kids content
        if (req.body.content) {
          req.body.content = this.filterKidsContent(req.body.content);
        }
      }

      next();
    };
  }

  /**
   * Security monitoring middleware
   */
  public securityMonitor() {
    return (req: Request, res: Response, next: NextFunction) => {
      this.metrics.totalRequests++;

      // Detect suspicious patterns
      const suspiciousPatterns = [
        /\.\.\//g, // Path traversal
        /<script/gi, // XSS attempts
        /union\s+select/gi, // SQL injection
        /javascript:/gi, // JavaScript injection
        /data:text\/html/gi // Data URI XSS
      ];

      const requestString = JSON.stringify({
        url: req.originalUrl,
        body: req.body,
        query: req.query,
        headers: req.headers
      });

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(requestString)) {
          this.metrics.suspiciousActivity++;
          this.logSecurityEvent('suspicious_request', req, `Suspicious pattern detected: ${pattern}`);
          
          // Block obviously malicious requests
          if (pattern.test(req.originalUrl) || pattern.test(JSON.stringify(req.body))) {
            this.metrics.blockedRequests++;
            return res.status(400).json({
              success: false,
              message: 'Request blocked for security reasons'
            });
          }
        }
      }

      next();
    };
  }

  /**
   * File upload security
   */
  public secureFileUpload() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.files || req.file) {
        const files = Array.isArray(req.files) ? req.files : [req.file || req.files];
        
        for (const file of files) {
          if (!file) continue;

          // File type validation
          const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'text/plain'
          ];

          if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
              success: false,
              message: 'File type not allowed'
            });
          }

          // File size validation (5MB max)
          if (file.size > 5 * 1024 * 1024) {
            return res.status(400).json({
              success: false,
              message: 'File size too large (max 5MB)'
            });
          }

          // Filename sanitization
          file.originalname = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        }
      }

      next();
    };
  }

  /**
   * Security audit system
   */
  public async performSecurityAudit(): Promise<SecurityAuditResult> {
    const vulnerabilities: SecurityVulnerability[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check environment variables
    const requiredEnvVars = ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'DB_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        vulnerabilities.push({
          severity: 'critical',
          type: 'configuration',
          description: `Missing required environment variable: ${envVar}`,
          location: 'Environment configuration',
          remediation: `Set the ${envVar} environment variable`
        });
        score -= 20;
      }
    }

    // Check JWT token strength
    if (process.env.ACCESS_TOKEN && process.env.ACCESS_TOKEN.length < 32) {
      vulnerabilities.push({
        severity: 'high',
        type: 'authentication',
        description: 'JWT secret is too short',
        location: 'ACCESS_TOKEN environment variable',
        remediation: 'Use a JWT secret with at least 32 characters'
      });
      score -= 15;
    }

    // Check rate limiting
    if (this.metrics.rateLimitHits > this.metrics.totalRequests * 0.1) {
      recommendations.push('Consider implementing more granular rate limiting');
    }

    // Check for suspicious activity
    if (this.metrics.suspiciousActivity > 0) {
      recommendations.push('Review suspicious activity logs and consider additional security measures');
    }

    return {
      passed: score >= 80,
      score,
      vulnerabilities,
      recommendations,
      timestamp: new Date()
    };
  }

  /**
   * Get security metrics
   */
  public getSecurityMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  /**
   * Log security events
   */
  private logSecurityEvent(type: string, req: Request, message: string): void {
    this.logger.warn('Security Event', {
      type,
      message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      userId: req.user?.id || 'anonymous'
    });
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: string | Date): number {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }

  /**
   * Filter content for kids safety
   */
  private filterKidsContent(content: any): any {
    if (typeof content === 'string') {
      // Remove potentially inappropriate content
      const inappropriateWords = [
        // Add inappropriate words list here
      ];
      
      let filtered = content;
      inappropriateWords.forEach(word => {
        const regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '***');
      });
      
      return filtered;
    }
    
    return content;
  }
}

export default SecurityManager.getInstance();
