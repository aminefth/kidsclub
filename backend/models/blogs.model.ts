import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

interface IComment extends Document {
    user: IUser,
    question: string,
    questionReplies: IComment[];
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


    questions: IComment[];
    category: string;
    activity: IActivityBlog;
    reviews: IReview[];
    reads: number;
    ratings: number;

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
    },
    questionReplies: [Object],
})

// blog data


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
    },
    reviews: [reviewSchema],
    ratings: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: {
        createdAt: 'published_at',
    }
})

const BlogModel: Model<IBlog> = mongoose.model<IBlog>("Blog", blogSchema);

export default BlogModel;