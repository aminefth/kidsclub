import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

interface IComment extends Document {
    user: IUser,
    question: string,
    questionReplies: IComment[];
    reactions: {
        likes: number,
        dislikes: number,
        hearts: number,
        laughs: number
    },
    isModerated: boolean,
    isFlagged: boolean,
    parentId: Schema.Types.ObjectId,
    depth: number,
}

interface IReview extends Document {
    user: IUser,
    rating: number,
    comment: string,
    commentReplies: IComment[];
}

interface ILink extends Document {
    title: string;
    url: string;
}

interface IActivityBlog extends Document {
    total_likes: number;
    total_comments: number;
    total_reads: number;
    total_parent_comments: number;
    average_read_time: number;
    bounce_rate: number;
    engagement_score: number;
}

export interface IBlog extends Document {
    blog_id: string;
    title: string;
    des: string;
    banner: string;
    content: [];
    tags: string[];
    author: IUser;
    comments: IComment[];
    draft: boolean;
    isPublished: boolean;

    ageGroup?: 'kids-6-8' | 'kids-9-12' | 'kids-13-16' | 'general';
    isKidsContent: boolean;
    educationalLevel?: 'beginner' | 'intermediate' | 'advanced';
    parentalGuidance?: boolean;

    questions: IComment[];
    category: string;
    activity: IActivityBlog;
    reviews: IReview[];
    reads: number;
    ratings: number;

    viewHistory: Array<{
        userId?: string;
        timestamp: Date;
        sessionId: string;
        readTime?: number;
    }>;
    
    metaDescription?: string;
    slug: string;
    featured: boolean;
}

// creating Schemas 
// reviews Schema

const reviewSchema = new Schema<IReview>({
    user: Object,
    rating: {
        type: Number,
        default: 0,
    },
    comment: {
        type: String,
    },
    commentReplies: [Object],
})

// Link Schema 
const linkSchema = new Schema<ILink>({
    title: {
        type: String,
    },
    url: {
        type: String,
    },
})

// comment 
const commentSchema = new Schema<IComment>({
    user: Object,
    question: {
        type: String,
        required: true,
    },
    questionReplies: [Object],
    reactions: {
        likes: { type: Number, default: 0 },
        dislikes: { type: Number, default: 0 },
        hearts: { type: Number, default: 0 },
        laughs: { type: Number, default: 0 }
    },
    isModerated: { type: Boolean, default: false },
    isFlagged: { type: Boolean, default: false },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment' },
    depth: { type: Number, default: 0 },
}, { timestamps: true })

// blog Schema

const blogSchema = new Schema<IBlog>({
    blog_id: {
        type: String,
        required: true,
        unique: true,
    },
    title: {
        type: String,
        required: true,
    },
    des: {
        type: String,
        maxlength: 200,
    },
    banner: {
        type: String,
    },
    content: [],
    tags: [String],
    author: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    draft: {
        type: Boolean,
        default: false,
    },
    isPublished: {
        type: Boolean,
        default: false,
    },
    
    ageGroup: {
        type: String,
        enum: ['kids-6-8', 'kids-9-12', 'kids-13-16', 'general'],
        default: 'general'
    },
    isKidsContent: {
        type: Boolean,
        default: false
    },
    educationalLevel: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced']
    },
    parentalGuidance: {
        type: Boolean,
        default: false
    },
    
    questions: [commentSchema],
    category: {
        type: String,
    },
    activity: {
        total_likes: {
            type: Number,
            default: 0,
        },
        total_comments: {
            type: Number,
            default: 0,
        },
        total_reads: {
            type: Number,
            default: 0,
        },
        total_parent_comments: {
            type: Number,
            default: 0,
        },
        average_read_time: {
            type: Number,
            default: 0
        },
        bounce_rate: {
            type: Number,
            default: 0
        },
        engagement_score: {
            type: Number,
            default: 0
        }
    },
    reviews: [reviewSchema],
    ratings: {
        type: Number,
        default: 0,
    },
    
    viewHistory: [{
        userId: String,
        timestamp: { type: Date, default: Date.now },
        sessionId: String,
        readTime: Number
    }],
    
    metaDescription: {
        type: String,
        maxlength: 160
    },
    slug: {
        type: String,
        unique: true,
        required: true
    },
    featured: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: {
        createdAt: 'published_at',
    }
})

const BlogModel: Model<IBlog> = mongoose.model<IBlog>("Blog", blogSchema);

export default BlogModel;