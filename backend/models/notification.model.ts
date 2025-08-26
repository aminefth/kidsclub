import mongoose, { Document, Model, Schema } from "mongoose";

export interface INotification extends Document {
    recipient: mongoose.Types.ObjectId;
    sender?: string;
    type: 'like' | 'comment' | 'follow' | 'mention' | 'blog_published' | 'system';
    title: string;
    message: string;
    isRead: boolean;
    data?: any;
    createdAt: Date;
    updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
    recipient: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    sender: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        required: true,
        enum: ['like', 'comment', 'follow', 'mention', 'blog_published', 'system']
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    data: {
        type: Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

const NotificationModel: Model<INotification> = mongoose.model("Notification", notificationSchema);

export default NotificationModel; 