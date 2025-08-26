import mongoose, { Document, Model, Schema } from "mongoose";
import { IUser } from "./user.model";

// Ad Campaign Model
export interface IAdCampaign extends Document {
  title: string;
  advertiser: {
    name: string;
    email: string;
    logo: string;
    verified: boolean;
  };
  content: {
    headline: string;
    description: string;
    image: string;
    url: string;
    callToAction: string;
  };
  targeting: {
    countries: string[];
    languages: string[];
    interests: string[];
    ageRange: { min: number; max: number };
    keywords: string[];
  };
  budget: {
    total: number;
    daily: number;
    bidType: 'CPC' | 'CPM' | 'CPA';
    bidAmount: number;
  };
  placement: {
    types: ('banner' | 'native' | 'sponsored' | 'video')[];
    positions: ('header' | 'sidebar' | 'footer' | 'inline')[];
    categories: string[];
  };
  schedule: {
    startDate: Date;
    endDate: Date;
    timezone: string;
    activeHours: { start: number; end: number };
  };
  status: 'draft' | 'pending' | 'active' | 'paused' | 'completed';
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
    spend: number;
    ctr: number;
    cpm: number;
    cpa: number;
  };
  isActive: boolean;
}

const adCampaignSchema = new Schema<IAdCampaign>({
  title: { type: String, required: true },
  advertiser: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    logo: { type: String },
    verified: { type: Boolean, default: false }
  },
  content: {
    headline: { type: String, required: true, maxlength: 60 },
    description: { type: String, required: true, maxlength: 160 },
    image: { type: String, required: true },
    url: { type: String, required: true },
    callToAction: { type: String, default: 'En savoir plus' }
  },
  targeting: {
    countries: [{ type: String }],
    languages: [{ type: String, default: 'fr' }],
    interests: [{ type: String }],
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 65 }
    },
    keywords: [{ type: String }]
  },
  budget: {
    total: { type: Number, required: true },
    daily: { type: Number, required: true },
    bidType: { type: String, enum: ['CPC', 'CPM', 'CPA'], default: 'CPC' },
    bidAmount: { type: Number, required: true }
  },
  placement: {
    types: [{ type: String, enum: ['banner', 'native', 'sponsored', 'video'] }],
    positions: [{ type: String, enum: ['header', 'sidebar', 'footer', 'inline'] }],
    categories: [{ type: String }]
  },
  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'Africa/Casablanca' },
    activeHours: {
      start: { type: Number, default: 0 },
      end: { type: Number, default: 23 }
    }
  },
  status: { 
    type: String, 
    enum: ['draft', 'pending', 'active', 'paused', 'completed'],
    default: 'draft'
  },
  performance: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    cpm: { type: Number, default: 0 },
    cpa: { type: Number, default: 0 }
  },
  isActive: { type: Boolean, default: false }
}, { timestamps: true });

// Index for performance
adCampaignSchema.index({ status: 1, isActive: 1 });
adCampaignSchema.index({ 'placement.categories': 1, 'targeting.countries': 1 });
adCampaignSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });

export const AdCampaign: Model<IAdCampaign> = mongoose.model("AdCampaign", adCampaignSchema);

// Note: AdAnalytics model is now defined in /models/adAnalytics.model.ts
// This prevents model overwrite errors and provides better organization
