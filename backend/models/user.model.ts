import { socialAuth } from './../controllers/user.controller';
import { redis } from '../utils/redis';
require("dotenv").config();
import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt, { Secret } from "jsonwebtoken";
// email regex pattern for validation
const emailRegexPattern: RegExp = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
const passwordRegexPattern: RegExp = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;


// profile images name list fallback url if image not exist
let profile_imgs_name_list =
    ["Garfield", "Tinkerbell", "Annie", "Loki", "Cleo", "Angel", "Bob", "Mia", "Coco", "Gracie", "Bear", "Bella", "Abby", "Harley", "Cali", "Leo", "Luna", "Jack", "Felix", "Kiki"];


let profile_imgs_collections_list =
    ["notionists-neutral", "adventurer-neutral", "fun-emoji"];

export interface IUser extends Document {
    name: string;
    email: string;
    password: string;
    username: string;
    phoneNumber: string;
    dateOfBirth: Date;
    country: string;
    bio: string;
    role: string;
    status: string;
    isVerified: boolean;
    isBanned: boolean;
    isSuspended: boolean;
    isDeleted: boolean;
    posts: Array<{ postId: string }>;
    reads: Array<{ readId: string }>;
    followers: Array<{ userId: string }>
    following: Array<{ userId: string }>
    notifications: Array<{ notificationId: string }>
    avatar: {
        public_id: string;
        url: string;
    },
    account_info: {
        total_posts: number;
        total_reads: number;
    },
    google_auth: boolean;
    interests: string[];
    socialLinks: {
        website?: string;
        twitter?: string;
        linkedin?: string;
        github?: string;
    };
    lastActive: Date;
    blogs: Schema.Types.ObjectId[];
    joinedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    comparePassword: (password: string) => Promise<boolean>;
    SignAccessToken: () => string;
    SignRefreshToken: () => string;








}

// read blog interface 



// schema for user model
const userSchema = new Schema<IUser>({

    /**
     * Defines the personal information fields for a User model.
     * Includes name, email, password, role, account status flags, avatar,
     * username, bio, post/follower/following references, social links,
     * and account info for total posts and reads.
     */

    name: {
        type: String,
        required: [true, "Please provide a name"],
        trim: true,
    },
    email: {
        type: String,
        required: [true, "Please provide an email with a valid format"],
        unique: true,
        trim: true,
        lowercase: true,
        validate: {
            validator: function (v: string) {
                return emailRegexPattern.test(v);
            },
            message: "Please provide a valid email",
        },
    },
    phoneNumber: {
        type: String,
        trim: true,
        lowercase: true,
    },
    dateOfBirth: {
        type: Date,
    },
    country: {
        type: String,
        trim: true,
    },
    password: {
        type: String,
        minlength: [
            6,
            "Password must be at least 6 characters long with 1 uppercase letter, 1 lowercase letter, 1 number and 1 special character and no spaces",
        ],
        trim: true,
        select: false,
        match: passwordRegexPattern,
    },
    role: {
        type: String,
        enum: ["admin", "user", "moderator", "author"],
        default: "user",
    },
    status: {
        type: String,
        enum: ["active", "inactive", "suspended", "banned"],
        default: "active",
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    isBanned: {
        type: Boolean,
        default: false,
    },
    isSuspended: {
        type: Boolean,
        default: false,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    avatar: {
        public_id: {
            type: String,
            default: "default",
        },
        url: {
            type: String,
            default: () => {
                return `https://api.dicebear.com/6.x/${profile_imgs_collections_list[
                    Math.floor(Math.random() * profile_imgs_collections_list.length)
                ]
                    }/svg?seed=${profile_imgs_name_list[
                    Math.floor(Math.random() * profile_imgs_name_list.length)
                    ]
                    }`;
            },
        },
    },
    username: {
        type: String,
        minlength: [3, "Username must be 3 letters long"],
        unique: true,
        trim: true,
    },
    bio: {
        type: String,
        maxlength: [200, "Bio should not be more than 200"],
        default: "",
    },

    followers: [
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        },
    ],
    following: [
        {
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        },
    ],
    notifications: [
        {
            notificationId: {
                type: Schema.Types.ObjectId,
                ref: "Notification",
            },
        },
    ],

    account_info: {
        total_posts: {
            type: Number,
            default: 0,
        },
        total_reads: {
            type: Number,
            default: 0,
        },
    },
    google_auth: {
        type: Boolean,
        default: false,
    },
    blogs: {
        type: [Schema.Types.ObjectId],
        ref: 'blog',
        default: [],
    },
    interests: {
        type: [String],
        default: [],
        maxlength: 10,
    },
    socialLinks: {
        website: {
            type: String,
            trim: true,
        },
        twitter: {
            type: String,
            trim: true,
        },
        linkedin: {
            type: String,
            trim: true,
        },
        github: {
            type: String,
            trim: true,
        }
    },
    lastActive: {
        type: Date,
        default: Date.now,
    }
}, { timestamps: true });

// sign access token
userSchema.methods.SignAccessToken = function () {
    const secret = process.env.ACCESS_TOKEN as string;
    return jwt.sign({ id: this._id }, secret, {
        expiresIn: "5m",
    });
};

// Sign refresh token
userSchema.methods.SignRefreshToken = function () {
    const secret = process.env.REFRESH_TOKEN as string;
    return jwt.sign({ id: this._id }, secret, {
        expiresIn: "7d",
    });
}


// hash password before saving to database
userSchema.pre<IUser>("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(
        this.password,
        salt
    );

    next();
});

// compare password with hashed password 
userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};


// exporting userModel 
export const userModel: Model<IUser> = mongoose.model("User", userSchema);

export default userModel;
