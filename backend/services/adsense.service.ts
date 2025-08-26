import { ArticleAnalyticsModel, UserActivityModel } from '../models/analytics.model';

interface AdPlacement {
    id: string;
    type: 'banner' | 'sidebar' | 'inline' | 'sticky';
    position: 'top' | 'middle' | 'bottom' | 'sidebar';
    size: string; // e.g., '728x90', '300x250', '320x50'
    adUnitId: string;
    isActive: boolean;
    kidsContentAllowed: boolean;
}

interface AdConfig {
    publisherId: string;
    placements: AdPlacement[];
    kidsContentRestrictions: {
        allowAds: boolean;
        restrictedCategories: string[];
        parentalConsentRequired: boolean;
    };
}

class AdSenseService {
    private config: AdConfig;

    constructor() {
        this.config = {
            publisherId: process.env.ADSENSE_PUBLISHER_ID || '',
            placements: [
                {
                    id: 'header-banner',
                    type: 'banner',
                    position: 'top',
                    size: '728x90',
                    adUnitId: process.env.ADSENSE_HEADER_UNIT || '',
                    isActive: true,
                    kidsContentAllowed: false
                },
                {
                    id: 'sidebar-rectangle',
                    type: 'sidebar',
                    position: 'sidebar',
                    size: '300x250',
                    adUnitId: process.env.ADSENSE_SIDEBAR_UNIT || '',
                    isActive: true,
                    kidsContentAllowed: false
                },
                {
                    id: 'mobile-banner',
                    type: 'banner',
                    position: 'bottom',
                    size: '320x50',
                    adUnitId: process.env.ADSENSE_MOBILE_UNIT || '',
                    isActive: true,
                    kidsContentAllowed: false
                }
            ],
            kidsContentRestrictions: {
                allowAds: false, // No ads on kids content by default
                restrictedCategories: ['kids-6-8', 'kids-9-12', 'kids-13-16'],
                parentalConsentRequired: true
            }
        };
    }

    /**
     * Get ad placements for a specific blog post
     */
    public getAdPlacements(blogData: {
        isKidsContent: boolean;
        ageGroup?: string;
        category: string;
        isPremium?: boolean;
    }) {
        // No ads for premium users or kids content
        if (blogData.isPremium || blogData.isKidsContent) {
            return [];
        }

        // Filter placements based on content type
        return this.config.placements.filter(placement => {
            if (blogData.isKidsContent && !placement.kidsContentAllowed) {
                return false;
            }
            return placement.isActive;
        });
    }

    /**
     * Generate AdSense script tags for frontend
     */
    public generateAdScript(placement: AdPlacement, isMobile: boolean = false) {
        if (!this.config.publisherId) {
            return null;
        }

        // Adjust size for mobile
        const size = isMobile && placement.size === '728x90' ? '320x50' : placement.size;
        const [width, height] = size.split('x');

        return {
            script: `
                <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-${this.config.publisherId}"
                        crossorigin="anonymous"></script>
                <ins class="adsbygoogle"
                     style="display:inline-block;width:${width}px;height:${height}px"
                     data-ad-client="ca-pub-${this.config.publisherId}"
                     data-ad-slot="${placement.adUnitId}"></ins>
                <script>
                     (adsbygoogle = window.adsbygoogle || []).push({});
                </script>
            `,
            placement: placement,
            size: { width: parseInt(width), height: parseInt(height) }
        };
    }

    /**
     * Track ad impressions and clicks
     */
    public async trackAdImpression(data: {
        userId?: string;
        sessionId: string;
        blogId: string;
        placementId: string;
        adUnitId: string;
    }) {
        try {
            await UserActivityModel.create({
                userId: data.userId,
                sessionId: data.sessionId,
                action: 'view',
                resourceType: 'blog',
                resourceId: data.blogId,
                metadata: {
                    adPlacement: data.placementId,
                    adUnitId: data.adUnitId,
                    eventType: 'ad_impression'
                }
            });

            // Update article analytics
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            await ArticleAnalyticsModel.findOneAndUpdate(
                { blogId: data.blogId, date: today },
                { $inc: { 'adImpressions': 1 } },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error tracking ad impression:', error);
        }
    }

    public async trackAdClick(data: {
        userId?: string;
        sessionId: string;
        blogId: string;
        placementId: string;
        adUnitId: string;
        clickValue?: number;
    }) {
        try {
            await UserActivityModel.create({
                userId: data.userId,
                sessionId: data.sessionId,
                action: 'view',
                resourceType: 'blog',
                resourceId: data.blogId,
                metadata: {
                    adPlacement: data.placementId,
                    adUnitId: data.adUnitId,
                    eventType: 'ad_click',
                    clickValue: data.clickValue || 0
                }
            });

            // Update article analytics
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            await ArticleAnalyticsModel.findOneAndUpdate(
                { blogId: data.blogId, date: today },
                { 
                    $inc: { 
                        'adClicks': 1,
                        'adRevenue': data.clickValue || 0
                    } 
                },
                { upsert: true }
            );
        } catch (error) {
            console.error('Error tracking ad click:', error);
        }
    }

    /**
     * Get ad performance analytics
     */
    public async getAdAnalytics(blogId?: string, dateRange?: { start: Date; end: Date }) {
        const matchQuery: any = {};
        
        if (blogId) {
            matchQuery.blogId = blogId;
        }
        
        if (dateRange) {
            matchQuery.date = {
                $gte: dateRange.start,
                $lte: dateRange.end
            };
        }

        const analytics = await ArticleAnalyticsModel.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalImpressions: { $sum: '$adImpressions' },
                    totalClicks: { $sum: '$adClicks' },
                    totalRevenue: { $sum: '$adRevenue' },
                    avgCTR: { 
                        $avg: { 
                            $cond: [
                                { $gt: ['$adImpressions', 0] },
                                { $divide: ['$adClicks', '$adImpressions'] },
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        return analytics[0] || {
            totalImpressions: 0,
            totalClicks: 0,
            totalRevenue: 0,
            avgCTR: 0
        };
    }

    /**
     * Check if ads should be shown for a user
     */
    public shouldShowAds(userData: {
        isPremium?: boolean;
        age?: number;
        parentalConsent?: boolean;
        adBlocker?: boolean;
    }): boolean {
        // No ads for premium users
        if (userData.isPremium) {
            return false;
        }

        // Check for ad blocker
        if (userData.adBlocker) {
            return false;
        }

        // Kids content restrictions
        if (userData.age && userData.age < 16) {
            return userData.parentalConsent === true;
        }

        return true;
    }

    /**
     * Get AdSense configuration for frontend
     */
    public getClientConfig() {
        return {
            publisherId: this.config.publisherId,
            placements: this.config.placements.filter(p => p.isActive),
            kidsRestrictions: this.config.kidsContentRestrictions
        };
    }
}

export default new AdSenseService();
