import { Request, Response, NextFunction } from "express";
import { AdCampaign, IAdCampaign } from "../models/advertisement.model";
import AdAnalyticsModel from "../models/adAnalytics.model";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from "../utils/redis";

// Get sponsored content for display
export const getSponsoredContent = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { placement = 'sidebar', limit = 3, category, country = 'MA' } = req.query;

      // Build targeting query
      const targetingQuery: any = {
        status: 'active',
        isActive: true,
        'schedule.startDate': { $lte: new Date() },
        'schedule.endDate': { $gte: new Date() },
        'targeting.countries': { $in: [country, 'ALL'] },
        'placement.positions': { $in: [placement] }
      };

      if (category) {
        targetingQuery['placement.categories'] = { $in: [category, 'ALL'] };
      }

      // Get active campaigns with budget remaining
      const campaigns = await AdCampaign.aggregate([
        { $match: targetingQuery },
        { 
          $addFields: {
            remainingBudget: { $subtract: ['$budget.total', '$performance.spend'] },
            score: {
              $add: [
                { $multiply: ['$performance.ctr', 100] }, // CTR score
                { $divide: ['$budget.bidAmount', 10] },    // Bid score
                { $cond: [{ $eq: ['$advertiser.verified', true] }, 20, 0] } // Verified bonus
              ]
            }
          }
        },
        { $match: { remainingBudget: { $gt: 0 } } },
        { $sort: { score: -1 } },
        { $limit: parseInt(limit as string) },
        {
          $project: {
            title: '$content.headline',
            description: '$content.description',
            image: '$content.image',
            url: '$content.url',
            advertiser: '$advertiser',
            category: { $arrayElemAt: ['$placement.categories', 0] },
            ctr: '$performance.ctr',
            rating: { $divide: [{ $add: ['$performance.ctr', 1] }, 0.5] }, // Simulated rating
            engagement: '$performance.clicks'
          }
        }
      ]);

      // Cache results for 5 minutes
      await redis.setex(`sponsored:${placement}:${category || 'all'}`, 300, JSON.stringify(campaigns));

      res.status(200).json({
        success: true,
        posts: campaigns
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Track ad impression
export const trackAdImpression = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        type, 
        campaignId, 
        placement, 
        page, 
        userAgent,
        country = 'MA' 
      } = req.body;

      // Parse user agent for device detection
      const deviceType = /Mobile|Android|iPhone/.test(userAgent) ? 'mobile' : 
                        /Tablet|iPad/.test(userAgent) ? 'tablet' : 'desktop';
      
      const browser = userAgent?.includes('Chrome') ? 'Chrome' :
                     userAgent?.includes('Firefox') ? 'Firefox' :
                     userAgent?.includes('Safari') ? 'Safari' : 'Other';

      // Create analytics record
      const analytics = new AdAnalyticsModel({
        type,
        campaignId: campaignId || null,
        placement,
        page: {
          url: page.url,
          title: page.title || '',
          category: page.category || ''
        },
        user: {
          id: req.user?._id || null,
          country,
          device: deviceType,
          browser,
          isReturning: !!req.user
        },
        event: 'impression',
        revenue: 0, // Will be updated later with actual revenue
        timestamp: new Date()
      });

      await analytics.save();

      // Update campaign performance if it's a sponsored ad
      if (campaignId && type === 'sponsored') {
        await AdCampaign.findByIdAndUpdate(campaignId, {
          $inc: { 'performance.impressions': 1 }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Impression tracked successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Track ad click
export const trackAdClick = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        type, 
        campaignId, 
        placement, 
        page, 
        revenue = 0,
        userAgent,
        country = 'MA' 
      } = req.body;

      const deviceType = /Mobile|Android|iPhone/.test(userAgent) ? 'mobile' : 
                        /Tablet|iPad/.test(userAgent) ? 'tablet' : 'desktop';
      
      const browser = userAgent?.includes('Chrome') ? 'Chrome' :
                     userAgent?.includes('Firefox') ? 'Firefox' :
                     userAgent?.includes('Safari') ? 'Safari' : 'Other';

      // Create analytics record
      const analytics = new AdAnalyticsModel({
        type,
        campaignId: campaignId || null,
        placement,
        page: {
          url: page.url,
          title: page.title || '',
          category: page.category || ''
        },
        user: {
          id: req.user?._id || null,
          country,
          device: deviceType,
          browser,
          isReturning: !!req.user
        },
        event: 'click',
        revenue,
        timestamp: new Date()
      });

      await analytics.save();

      // Update campaign performance
      if (campaignId && type === 'sponsored') {
        const campaign = await AdCampaign.findById(campaignId);
        if (campaign) {
          const newClicks = campaign.performance.clicks + 1;
          const newSpend = campaign.performance.spend + campaign.budget.bidAmount;
          const newCTR = newClicks / Math.max(campaign.performance.impressions, 1);

          await AdCampaign.findByIdAndUpdate(campaignId, {
            $inc: { 
              'performance.clicks': 1,
              'performance.spend': campaign.budget.bidAmount
            },
            $set: {
              'performance.ctr': newCTR
            }
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Click tracked successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Get revenue data for dashboard
export const getRevenueData = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = end ? new Date(end as string) : new Date();

      // Aggregate revenue data by day
      const dailyRevenue = await AdAnalyticsModel.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate, $lte: endDate },
            event: 'click'
          }
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              type: '$type'
            },
            revenue: { $sum: '$revenue' },
            clicks: { $sum: 1 },
            impressions: { $sum: { $cond: [{ $eq: ['$event', 'impression'] }, 1, 0] } }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            adsenseRevenue: {
              $sum: { $cond: [{ $eq: ['$_id.type', 'adsense'] }, '$revenue', 0] }
            },
            sponsoredRevenue: {
              $sum: { $cond: [{ $eq: ['$_id.type', 'sponsored'] }, '$revenue', 0] }
            },
            totalRevenue: { $sum: '$revenue' },
            totalClicks: { $sum: '$clicks' },
            totalImpressions: { $sum: '$impressions' }
          }
        },
        {
          $project: {
            date: '$_id',
            data: 1,
            totalRevenue: 1,
            _id: 0
          }
        },
        { $sort: { date: 1 } }
      ]);

      // Transform data for easier frontend consumption
      const transformedData = dailyRevenue.reduce((acc: any, day: any) => {
        acc[day.date] = {
          total: day.totalRevenue,
          breakdown: day.data.reduce((sum: any, item: any) => {
            sum[item.type] = item.revenue;
            return sum;
          }, {})
        };
        return acc;
      }, {});

      res.status(200).json({
        success: true,
        dailyRevenue: transformedData,
        period: {
          start: startDate,
          end: endDate
        }
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Get optimal ad for user (AI-powered recommendation)
export const getOptimalAd = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, placement = 'sidebar', category } = req.query;

      // Simple algorithm - in production, use ML model
      let targetingQuery: any = {
        status: 'active',
        isActive: true,
        'schedule.startDate': { $lte: new Date() },
        'schedule.endDate': { $gte: new Date() },
        'placement.positions': { $in: [placement] }
      };

      if (category) {
        targetingQuery['placement.categories'] = { $in: [category] };
      }

      // Get user's reading history if authenticated
      if (userId) {
        // Add user-specific targeting logic here
        // For now, just add basic personalization
      }

      const optimalAd = await AdCampaign.findOne(targetingQuery)
        .sort({ 'performance.ctr': -1, 'budget.bidAmount': -1 })
        .select('content advertiser performance');

      res.status(200).json({
        success: true,
        ad: optimalAd
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Create ad campaign (for advertisers)
export const createAdCampaign = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaignData = req.body;

      // Validate budget
      if (campaignData.budget.daily * 30 > campaignData.budget.total) {
        return next(new ErrorHandler('Daily budget is too high for total budget', 400));
      }

      // Create campaign
      const campaign = new AdCampaign(campaignData);
      await campaign.save();

      res.status(201).json({
        success: true,
        campaign,
        message: 'Ad campaign created successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Get ad campaigns
export const getAdCampaigns = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, limit = 20, page = 1 } = req.query;
      
      let query: any = {};
      if (status) {
        query.status = status;
      }

      const campaigns = await AdCampaign.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string))
        .skip((parseInt(page as string) - 1) * parseInt(limit as string))
        .select('-__v');

      const total = await AdCampaign.countDocuments(query);

      res.status(200).json({
        success: true,
        campaigns,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Update ad campaign
export const updateAdCampaign = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const campaign = await AdCampaign.findByIdAndUpdate(
        id, 
        updateData, 
        { new: true, runValidators: true }
      );

      if (!campaign) {
        return next(new ErrorHandler('Campaign not found', 404));
      }

      res.status(200).json({
        success: true,
        campaign,
        message: 'Campaign updated successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

// Get detailed analytics
export const getAdAnalytics = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        start, 
        end, 
        type, 
        placement, 
        groupBy = 'day' 
      } = req.query;

      const startDate = start ? new Date(start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = end ? new Date(end as string) : new Date();

      let matchQuery: any = {
        timestamp: { $gte: startDate, $lte: endDate }
      };

      if (type) matchQuery.type = type;
      if (placement) matchQuery.placement = placement;

      // Group format based on groupBy parameter
      let dateFormat = '%Y-%m-%d';
      if (groupBy === 'hour') dateFormat = '%Y-%m-%d %H:00';
      if (groupBy === 'month') dateFormat = '%Y-%m';

      const analytics = await AdAnalyticsModel.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: dateFormat, date: '$timestamp' } },
              event: '$event',
              type: '$type',
              placement: '$placement'
            },
            count: { $sum: 1 },
            revenue: { $sum: '$revenue' }
          }
        },
        {
          $group: {
            _id: {
              date: '$_id.date',
              type: '$_id.type',
              placement: '$_id.placement'
            },
            impressions: {
              $sum: { $cond: [{ $eq: ['$_id.event', 'impression'] }, '$count', 0] }
            },
            clicks: {
              $sum: { $cond: [{ $eq: ['$_id.event', 'click'] }, '$count', 0] }
            },
            revenue: { $sum: '$revenue' }
          }
        },
        {
          $addFields: {
            ctr: {
              $cond: [
                { $gt: ['$impressions', 0] },
                { $multiply: [{ $divide: ['$clicks', '$impressions'] }, 100] },
                0
              ]
            },
            cpm: {
              $cond: [
                { $gt: ['$impressions', 0] },
                { $multiply: [{ $divide: ['$revenue', '$impressions'] }, 1000] },
                0
              ]
            }
          }
        },
        { $sort: { '_id.date': 1 } }
      ]);

      res.status(200).json({
        success: true,
        analytics,
        period: { start: startDate, end: endDate },
        groupBy
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
