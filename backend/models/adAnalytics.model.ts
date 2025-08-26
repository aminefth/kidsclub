import mongoose, { Document, Model, Schema } from "mongoose";

export interface IAdAnalytics extends Document {
  _id: string;
  campaignId: Schema.Types.ObjectId;
  adType: 'adsense' | 'sponsored_content' | 'banner' | 'native' | 'video';
  placement: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number; // Click-through rate
  cpm: number; // Cost per mille
  cpa: number; // Cost per acquisition
  
  // User and device data
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  device?: string;
  browser?: string;
  
  // Targeting data
  targetingData?: {
    interests?: string[];
    demographics?: any;
    location?: string;
    language?: string;
  };
  
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adAnalyticsSchema = new Schema<IAdAnalytics>({
  campaignId: {
    type: Schema.Types.ObjectId,
    ref: 'AdCampaign',
    required: true
  },
  adType: {
    type: String,
    enum: ['adsense', 'sponsored_content', 'banner', 'native', 'video'],
    required: true
  },
  placement: {
    type: String,
    required: true
  },
  impressions: {
    type: Number,
    default: 0
  },
  clicks: {
    type: Number,
    default: 0
  },
  conversions: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  ctr: {
    type: Number,
    default: 0
  },
  cpm: {
    type: Number,
    default: 0
  },
  cpa: {
    type: Number,
    default: 0
  },
  
  // User and device data
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  userAgent: String,
  ipAddress: String,
  country: String,
  device: String,
  browser: String,
  
  // Targeting data
  targetingData: {
    interests: [String],
    demographics: Schema.Types.Mixed,
    location: String,
    language: String
  },
  
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
adAnalyticsSchema.index({ campaignId: 1, timestamp: -1 });
adAnalyticsSchema.index({ adType: 1, timestamp: -1 });
adAnalyticsSchema.index({ placement: 1, timestamp: -1 });
adAnalyticsSchema.index({ userId: 1, timestamp: -1 });
adAnalyticsSchema.index({ timestamp: -1 });

// Prevent model overwrite errors during development
let AdAnalyticsModel: Model<IAdAnalytics>;

try {
  AdAnalyticsModel = mongoose.model<IAdAnalytics>("AdAnalytics");
} catch (error) {
  AdAnalyticsModel = mongoose.model<IAdAnalytics>("AdAnalytics", adAnalyticsSchema);
}

export default AdAnalyticsModel;
