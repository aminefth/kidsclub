import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

export interface IComment extends Document {
    _id: string;
    content: string;
    author: IUser;
    blogId: mongoose.Types.ObjectId;
    parentId?: string;
    depth: number;
    
    // Reactions
    reactions: {
        likes: string[]; // Array of user IDs who liked
        dislikes: string[];
        hearts: string[];
        laughs: string[];
    };
    
    // Moderation
    isModerated: boolean;
    isFlagged: boolean;
    flagReasons?: string[];
    moderatedBy?: string;
    moderatedAt?: Date;
    
    // Kids safety
    isKidsSafe: boolean;
    containsInappropriateContent: boolean;
    
    // Analytics
    replyCount: number;
    totalReactions: number;
    
    createdAt: Date;
    updatedAt: Date;
}

const commentSchema = new Schema<IComment>({
    content: {
        type: String,
        required: true,
        maxlength: 2000
    },
    author: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    blogId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Blog'
    },
    parentId: {
        type: Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },
    depth: {
        type: Number,
        default: 0,
        max: 5 // Limit nesting depth
    },
    
    reactions: {
        likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        dislikes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        hearts: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        laughs: [{ type: Schema.Types.ObjectId, ref: 'User' }]
    },
    
    isModerated: {
        type: Boolean,
        default: false
    },
    isFlagged: {
        type: Boolean,
        default: false
    },
    flagReasons: [String],
    moderatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    moderatedAt: Date,
    
    isKidsSafe: {
        type: Boolean,
        default: true
    },
    containsInappropriateContent: {
        type: Boolean,
        default: false
    },
    
    replyCount: {
        type: Number,
        default: 0
    },
    totalReactions: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Indexes for performance
commentSchema.index({ blogId: 1, parentId: 1 });
commentSchema.index({ author: 1 });
commentSchema.index({ createdAt: -1 });
commentSchema.index({ isKidsSafe: 1, containsInappropriateContent: 1 });

// Note: totalReactions is now a regular schema field, not a virtual property

const CommentModel: Model<IComment> = mongoose.model<IComment>("Comment", commentSchema);

export default CommentModel;
