import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

// interface social links schema

export interface ISocialLinks extends Document {
    user: IUser
    youtube: string;
    instagram: string;
    facebook: string;
    twitter: string;
    github: string;
    website: string;
}

// social links schema
const socialLinksSchema = new Schema<ISocialLinks>({
    user: {
        type: Schema.Types.ObjectId,
        ref: "users",
        required: true,
    },
    youtube: {
        type: String,
        default: "",
    },
    instagram: {
        type: String,
        default: "",
    },
    facebook: {
        type: String,
        default: "",
    },
    twitter: {
        type: String,
        default: "",
    },
    github: {
        type: String,
        default: "",
    },
    website: {
        type: String,
        default: "",
    },
}, { timestamps: true })

const SocialLinks: Model<ISocialLinks> = mongoose.model("social_links", socialLinksSchema);
export default SocialLinks;