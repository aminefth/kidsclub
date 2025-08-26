import { AdCampaign, IAdCampaign } from '../models/advertisement.model';

export class AdOptimizer {
  static calculateOptimalPlacement(
    userProfile: any,
    contentCategory: string,
    availableCampaigns: IAdCampaign[]
  ): IAdCampaign | null {
    
    // Score each campaign based on:
    // 1. User targeting match
    // 2. Content relevance
    // 3. Performance history
    // 4. Bid amount
    
    const scoredCampaigns = availableCampaigns.map(campaign => {
      let score = 0;
      
      // Targeting score (40%)
      if (campaign.targeting.interests.some(interest => 
          userProfile.interests?.includes(interest)
      )) {
        score += 40;
      }
      
      // Content relevance (30%)
      if (campaign.placement.categories.includes(contentCategory)) {
        score += 30;
      }
      
      // Performance score (20%)
      score += Math.min(campaign.performance.ctr * 20, 20);
      
      // Bid score (10%)
      score += Math.min(campaign.budget.bidAmount / 10, 10);
      
      return { campaign, score };
    });
    
    // Return highest scoring campaign
    const best = scoredCampaigns
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)[0];
    
    return best?.campaign || null;
  }
  
  static async updatePerformanceMetrics(campaignId: string) {
    const campaign = await AdCampaign.findById(campaignId);
    if (!campaign) return;
    
    // Calculate CTR, CPM, etc.
    const ctr = campaign.performance.impressions > 0 
      ? (campaign.performance.clicks / campaign.performance.impressions) * 100 
      : 0;
      
    const cpm = campaign.performance.impressions > 0
      ? (campaign.performance.spend / campaign.performance.impressions) * 1000
      : 0;
    
    await AdCampaign.findByIdAndUpdate(campaignId, {
      $set: {
        'performance.ctr': ctr,
        'performance.cpm': cpm
      }
    });
  }

  static async getPersonalizedAds(userId: string, placement: string, limit: number = 3) {
    // Advanced personalization algorithm
    // In production, this would use ML models and user behavior analysis
    
    const now = new Date();
    const baseQuery = {
      status: 'active',
      isActive: true,
      'schedule.startDate': { $lte: now },
      'schedule.endDate': { $gte: now },
      'placement.positions': { $in: [placement] }
    };

    // Get campaigns with remaining budget
    const campaigns = await AdCampaign.aggregate([
      { $match: baseQuery },
      {
        $addFields: {
          remainingBudget: { $subtract: ['$budget.total', '$performance.spend'] },
          personalizedScore: {
            $add: [
              { $multiply: ['$performance.ctr', 50] }, // CTR weight
              { $divide: ['$budget.bidAmount', 5] },   // Bid weight
              { $cond: [{ $eq: ['$advertiser.verified', true] }, 25, 0] }, // Verified bonus
              { $multiply: [{ $rand: {} }, 20] } // Randomization factor
            ]
          }
        }
      },
      { $match: { remainingBudget: { $gt: 0 } } },
      { $sort: { personalizedScore: -1 } },
      { $limit: limit }
    ]);

    return campaigns;
  }

  static calculateRevenuePotential(campaign: IAdCampaign, expectedImpressions: number): number {
    const { bidType, bidAmount } = campaign.budget;
    const ctr = campaign.performance.ctr || 0.01; // Default 1% CTR
    
    switch (bidType) {
      case 'CPM':
        return (expectedImpressions / 1000) * bidAmount;
      case 'CPC':
        return expectedImpressions * (ctr / 100) * bidAmount;
      case 'CPA':
        const conversionRate = 0.02; // Default 2% conversion rate
        return expectedImpressions * (ctr / 100) * conversionRate * bidAmount;
      default:
        return 0;
    }
  }

  static async optimizeCampaignBudget(campaignId: string) {
    const campaign = await AdCampaign.findById(campaignId);
    if (!campaign) return;

    const { performance, budget } = campaign;
    const currentCTR = performance.ctr;
    const currentCPM = performance.cpm;
    
    // Simple optimization logic
    let recommendedBidAdjustment = 0;
    
    if (currentCTR > 2.0) {
      // High CTR - increase bid by 10%
      recommendedBidAdjustment = 0.1;
    } else if (currentCTR < 0.5) {
      // Low CTR - decrease bid by 10%
      recommendedBidAdjustment = -0.1;
    }
    
    const newBidAmount = budget.bidAmount * (1 + recommendedBidAdjustment);
    
    return {
      currentBid: budget.bidAmount,
      recommendedBid: Math.max(0.01, newBidAmount), // Minimum bid of 0.01
      adjustment: recommendedBidAdjustment,
      reason: currentCTR > 2.0 ? 'High CTR - increase bid' : 
              currentCTR < 0.5 ? 'Low CTR - decrease bid' : 'Maintain current bid'
    };
  }
}

export default AdOptimizer;
