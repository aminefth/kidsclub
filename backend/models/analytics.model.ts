import mongoose, { Document, Model, Schema } from "mongoose";

// User Activity Tracking
export interface IUserActivity extends Document {
    userId: string;
    sessionId: string;
    action: 'view' | 'like' | 'comment' | 'share' | 'bookmark' | 'follow' | 'search';
    resourceType: 'blog' | 'user' | 'comment' | 'category';
    resourceId: string;
    metadata?: {
        readTime?: number;
        scrollDepth?: number;
        searchQuery?: string;
        referrer?: string;
        userAgent?: string;
        location?: {
            country?: string;
            city?: string;
        };
    };
    timestamp: Date;
}

// Article Performance Analytics
export interface IArticleAnalytics extends Document {
    blogId: string;
    date: Date;
    views: number;
    uniqueViews: number;
    averageReadTime: number;
    bounceRate: number;
    engagementScore: number;
    comments: number;
    likes: number;
    shares: number;
    bookmarks: number;
    
    // Kids-specific metrics
    kidsViews: number;
    parentalViews: number;
    ageGroupBreakdown: {
        'kids-6-8': number;
        'kids-9-12': number;
        'kids-13-16': number;
        'general': number;
    };
    
    // Traffic sources
    trafficSources: {
        direct: number;
        social: number;
        search: number;
        referral: number;
    };
}

// Platform-wide Analytics
export interface IPlatformAnalytics extends Document {
    date: Date;
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalArticles: number;
    publishedArticles: number;
    totalComments: number;
    totalViews: number;
    
    // Kids Club specific
    kidsClubActiveUsers: number;
    kidsContentViews: number;
    parentalControlActivations: number;
    
    // Monetization
    adImpressions: number;
    adClicks: number;
    adRevenue: number;
    premiumSubscriptions: number;
}

const userActivitySchema = new Schema<IUserActivity>({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sessionId: {
        type: String,
        required: true
    },
    action: {
        type: String,
        enum: ['view', 'like', 'comment', 'share', 'bookmark', 'follow', 'search'],
        required: true
    },
    resourceType: {
        type: String,
        enum: ['blog', 'user', 'comment', 'category'],
        required: true
    },
    resourceId: {
        type: String,
        required: true
    },
    metadata: {
        readTime: Number,
        scrollDepth: Number,
        searchQuery: String,
        referrer: String,
        userAgent: String,
        location: {
            country: String,
            city: String
        }
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: false
});

const articleAnalyticsSchema = new Schema<IArticleAnalytics>({
    blogId: {
        type: Schema.Types.ObjectId,
        ref: 'Blog',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    views: { type: Number, default: 0 },
    uniqueViews: { type: Number, default: 0 },
    averageReadTime: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    bookmarks: { type: Number, default: 0 },
    
    kidsViews: { type: Number, default: 0 },
    parentalViews: { type: Number, default: 0 },
    ageGroupBreakdown: {
        'kids-6-8': { type: Number, default: 0 },
        'kids-9-12': { type: Number, default: 0 },
        'kids-13-16': { type: Number, default: 0 },
        'general': { type: Number, default: 0 }
    },
    
    trafficSources: {
        direct: { type: Number, default: 0 },
        social: { type: Number, default: 0 },
        search: { type: Number, default: 0 },
        referral: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

const platformAnalyticsSchema = new Schema<IPlatformAnalytics>({
    date: {
        type: Date,
        required: true,
        unique: true
    },
    totalUsers: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    totalArticles: { type: Number, default: 0 },
    publishedArticles: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    
    kidsClubActiveUsers: { type: Number, default: 0 },
    kidsContentViews: { type: Number, default: 0 },
    parentalControlActivations: { type: Number, default: 0 },
    
    adImpressions: { type: Number, default: 0 },
    adClicks: { type: Number, default: 0 },
    adRevenue: { type: Number, default: 0 },
    premiumSubscriptions: { type: Number, default: 0 }
}, {
    timestamps: true
});

// Indexes for performance
userActivitySchema.index({ userId: 1, timestamp: -1 });
userActivitySchema.index({ sessionId: 1 });
userActivitySchema.index({ action: 1, resourceType: 1 });
userActivitySchema.index({ timestamp: -1 });

articleAnalyticsSchema.index({ blogId: 1, date: -1 });
articleAnalyticsSchema.index({ date: -1 });

platformAnalyticsSchema.index({ date: -1 });

export const UserActivityModel: Model<IUserActivity> = mongoose.model<IUserActivity>("UserActivity", userActivitySchema);
export const ArticleAnalyticsModel: Model<IArticleAnalytics> = mongoose.model<IArticleAnalytics>("ArticleAnalytics", articleAnalyticsSchema);
export const PlatformAnalyticsModel: Model<IPlatformAnalytics> = mongoose.model<IPlatformAnalytics>("PlatformAnalytics", platformAnalyticsSchema);
