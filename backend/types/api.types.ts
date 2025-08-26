import { Request } from 'express';
import { z } from 'zod';
import { IUser } from '../models/user.model';

/**
 * Professional TypeScript types and interfaces for KidsClub API
 * Enterprise-grade type safety with comprehensive validation schemas
 */

// ================================
// CORE API TYPES
// ================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    timestamp: string;
    requestId: string;
    version: string;
    pagination?: PaginationMeta;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// ================================
// USER TYPES & SCHEMAS
// ================================

export enum UserRole {
  USER = 'user',
  AUTHOR = 'author',
  MODERATOR = 'moderator',
  ADMIN = 'admin'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending'
}

export const UserRegistrationSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters')
    .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces'),
  email: z.string()
    .email('Invalid email format')
    .toLowerCase(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain uppercase, lowercase, number and special character'),
  confirmPassword: z.string(),
  dateOfBirth: z.string()
    .datetime()
    .optional(),
  country: z.string()
    .min(2, 'Country code must be at least 2 characters')
    .max(3, 'Country code must not exceed 3 characters')
    .default('MA'),
  acceptTerms: z.boolean()
    .refine(val => val === true, 'You must accept the terms and conditions')
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const UserLoginSchema = z.object({
  email: z.string().email().transform(val => val.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false)
});

export const UserUpdateSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters')
    .optional(),
  bio: z.string()
    .max(500, 'Bio must not exceed 500 characters')
    .optional(),
  dateOfBirth: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format" }).optional(),
  country: z.string().min(2).max(3).optional(),
  interests: z.array(z.string()).max(10, 'Maximum 10 interests allowed').optional(),
  socialLinks: z.object({
    website: z.string().refine(val => /^https?:\/\/.+/.test(val), { message: "Invalid URL format" }).optional(),
    twitter: z.string().refine(val => /^https?:\/\/.+/.test(val), { message: "Invalid URL format" }).optional(),
    linkedin: z.string().refine(val => /^https?:\/\/.+/.test(val), { message: "Invalid URL format" }).optional(),
    github: z.string().refine(val => /^https?:\/\/.+/.test(val), { message: "Invalid URL format" }).optional()
  }).optional()
});

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  avatar?: string;
  bio?: string;
  dateOfBirth?: Date;
  country: string;
  interests: string[];
  socialLinks?: {
    website?: string;
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
  followers: number;
  following: number;
  postsCount: number;
  isVerified: boolean;
  lastActive: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ================================
// BLOG TYPES & SCHEMAS
// ================================

export enum BlogStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SCHEDULED = 'scheduled'
}

export enum BlogCategory {
  KIDS = 'kids',
  EDUCATION = 'education',
  ENTERTAINMENT = 'entertainment',
  HEALTH = 'health',
  TECHNOLOGY = 'technology',
  LIFESTYLE = 'lifestyle',
  NEWS = 'news'
}

export const BlogCreateSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must not exceed 200 characters'),
  content: z.string()
    .min(100, 'Content must be at least 100 characters')
    .max(50000, 'Content must not exceed 50,000 characters'),
  excerpt: z.string()
    .min(50, 'Excerpt must be at least 50 characters')
    .max(500, 'Excerpt must not exceed 500 characters'),
  category: z.nativeEnum(BlogCategory),
  tags: z.array(z.string())
    .min(1, 'At least one tag is required')
    .max(10, 'Maximum 10 tags allowed'),
  featuredImage: z.string().url().optional(),
  status: z.nativeEnum(BlogStatus).default(BlogStatus.DRAFT),
  publishedAt: z.string().datetime().optional(),
  ageRating: z.number()
    .min(0, 'Age rating must be 0 or higher')
    .max(18, 'Age rating must be 18 or lower')
    .optional(),
  isKidsContent: z.boolean().default(false),
  seoMeta: z.object({
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
    keywords: z.array(z.string()).max(20).optional()
  }).optional()
});

export const BlogUpdateSchema = BlogCreateSchema.partial();

export interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  author: {
    _id: string;
    name: string;
    avatar?: string;
  };
  category: BlogCategory;
  tags: string[];
  featuredImage?: string;
  status: BlogStatus;
  publishedAt?: Date;
  ageRating?: number;
  isKidsContent: boolean;
  views: number;
  likes: number;
  commentsCount: number;
  readTime: number;
  seoMeta?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

// ================================
// COMMENT TYPES & SCHEMAS
// ================================

export enum CommentStatus {
  APPROVED = 'approved',
  PENDING = 'pending',
  REJECTED = 'rejected',
  FLAGGED = 'flagged'
}

export const CommentCreateSchema = z.object({
  content: z.string()
    .min(1, 'Comment content is required')
    .max(2000, 'Comment must not exceed 2000 characters'),
  blogId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid blog ID format'),
  parentId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid parent comment ID format')
    .optional(),
  mentions: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/))
    .max(5, 'Maximum 5 mentions allowed')
    .optional()
});

export const CommentUpdateSchema = z.object({
  content: z.string()
    .min(1, 'Comment content is required')
    .max(2000, 'Comment must not exceed 2000 characters')
});

export interface Comment {
  _id: string;
  content: string;
  author: {
    _id: string;
    name: string;
    avatar?: string;
  };
  blog: string;
  parent?: string;
  replies: Comment[];
  status: CommentStatus;
  likes: number;
  dislikes: number;
  isEdited: boolean;
  editedAt?: Date;
  mentions: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ================================
// NOTIFICATION TYPES & SCHEMAS
// ================================

export enum NotificationType {
  LIKE = 'like',
  COMMENT = 'comment',
  REPLY = 'reply',
  FOLLOW = 'follow',
  MENTION = 'mention',
  BLOG_PUBLISHED = 'blog_published',
  SYSTEM = 'system'
}

export interface Notification {
  _id: string;
  recipient: string;
  sender?: {
    _id: string;
    name: string;
    avatar?: string;
  };
  type: NotificationType;
  title: string;
  message: string;
  data?: {
    blogId?: string;
    commentId?: string;
    url?: string;
  };
  isRead: boolean;
  createdAt: Date;
}

// ================================
// ANALYTICS TYPES & SCHEMAS
// ================================

export const AnalyticsQuerySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.enum(['views', 'likes', 'comments', 'shares', 'revenue']))
    .min(1, 'At least one metric is required'),
  filters: z.object({
    category: z.nativeEnum(BlogCategory).optional(),
    author: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    country: z.string().min(2).max(3).optional()
  }).optional()
});

export interface AnalyticsData {
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalRevenue: number;
    uniqueVisitors: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  trends: Array<{
    date: string;
    views: number;
    likes: number;
    comments: number;
    revenue: number;
  }>;
  topContent: Array<{
    _id: string;
    title: string;
    views: number;
    engagement: number;
  }>;
}

// ================================
// HEALTH CHECK TYPES
// ================================

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  message?: string;
  lastChecked: string;
}

export interface SystemHealth {
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
    cores: number;
  };
  disk?: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    imagekit: ServiceHealth;
  };
  system: SystemHealth;
  performance: {
    averageResponseTime: number;
    requestsPerSecond: number;
    errorRate: number;
  };
}

// ================================
// UTILITY TYPES
// ================================

export type WithPagination<T> = {
  data: T[];
  pagination: PaginationMeta;
};

export type ApiHandler<T = any> = (
  req: AuthenticatedRequest,
  res: Response
) => Promise<void>;

export type ValidationSchema = z.ZodSchema<any>;

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  received?: any;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: ValidationError[];
  code: string;
  timestamp: string;
  requestId: string;
}
