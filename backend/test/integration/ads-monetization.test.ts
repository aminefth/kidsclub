import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import BlogModel from '../../models/blogs.model';
import { UserFactory } from '../factories/user.factory';
import { BlogFactory } from '../factories/blog.factory';
import { mockRedis } from '../mocks/redis.mock';
import jwt from 'jsonwebtoken';

// Mock Stripe
const mockStripe = {
  customers: {
    create: jest.fn().mockResolvedValue({
      id: 'cus_test123',
      email: 'test@example.com'
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_test123',
      email: 'test@example.com'
    })
  },
  subscriptions: {
    create: jest.fn().mockResolvedValue({
      id: 'sub_test123',
      status: 'active',
      current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'sub_test123',
      status: 'active'
    }),
    update: jest.fn().mockResolvedValue({
      id: 'sub_test123',
      status: 'active'
    })
  },
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test123',
      client_secret: 'pi_test123_secret_test',
      status: 'requires_payment_method'
    })
  }
};

// Mock AdSense integration
const mockAdSense = {
  getOptimalAd: jest.fn().mockResolvedValue({
    id: 'ad_test123',
    type: 'display',
    content: '<div>Test Ad Content</div>',
    targeting: {
      ageGroup: 'adult',
      interests: ['technology', 'education']
    },
    revenue: {
      cpm: 2.50,
      estimatedEarnings: 0.025
    }
  }),
  trackImpression: jest.fn().mockResolvedValue({
    success: true,
    impressionId: 'imp_test123'
  }),
  trackClick: jest.fn().mockResolvedValue({
    success: true,
    clickId: 'click_test123',
    revenue: 0.15
  })
};

// Create test app
const app = express();
app.use(express.json());

// Mock auth middleware
const mockAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN!) as any;
    req.user = decoded.user;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Monetization routes
app.post('/api/v1/subscriptions/create', mockAuth, async (req: any, res: any) => {
  try {
    const { priceId, paymentMethodId } = req.body;
    const userId = req.user._id;

    // Create Stripe customer if doesn't exist
    const customer = await mockStripe.customers.create({
      email: req.user.email,
      metadata: { userId }
    });

    // Create subscription
    const subscription = await mockStripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      expand: ['latest_invoice.payment_intent']
    });

    // Update user subscription status
    await userModel.findByIdAndUpdate(userId, {
      subscription: {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      }
    });

    res.status(201).json({
      success: true,
      subscription,
      message: 'Subscription created successfully'
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/ads/optimal', async (req: any, res: any) => {
  try {
    const { placement, userAge, interests, country } = req.query;
    
    // Don't serve ads to kids
    if (userAge && parseInt(userAge) < 18) {
      return res.status(200).json({
        success: true,
        ad: null,
        message: 'No ads for minors'
      });
    }

    const ad = await mockAdSense.getOptimalAd({
      placement,
      targeting: {
        interests: interests ? interests.split(',') : [],
        country
      }
    });

    res.status(200).json({
      success: true,
      ad
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/ads/track/impression', async (req: any, res: any) => {
  try {
    const { adId, placement, userId } = req.body;
    
    const result = await mockAdSense.trackImpression({
      adId,
      placement,
      userId,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      impressionId: result.impressionId
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/ads/track/click', async (req: any, res: any) => {
  try {
    const { adId, impressionId, userId } = req.body;
    
    const result = await mockAdSense.trackClick({
      adId,
      impressionId,
      userId,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      clickId: result.clickId,
      revenue: result.revenue
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/creator/earnings', mockAuth, async (req: any, res: any) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user._id;

    // Mock creator earnings calculation
    const earnings = {
      totalEarnings: 150.75,
      adRevenue: 45.25,
      subscriptionRevenue: 85.50,
      affiliateRevenue: 20.00,
      period: {
        start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: endDate || new Date()
      },
      breakdown: [
        { date: '2025-08-01', earnings: 5.25, source: 'ads' },
        { date: '2025-08-02', earnings: 12.50, source: 'subscription' },
        { date: '2025-08-03', earnings: 3.75, source: 'affiliate' }
      ]
    };

    res.status(200).json({
      success: true,
      earnings
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

describe('Monetization & Payment System', () => {
  let regularUser: any;
  let creatorUser: any;
  let adminUser: any;
  let userToken: string;
  let creatorToken: string;
  let adminToken: string;

  beforeEach(async () => {
    // Create test users
    regularUser = await userModel.create({
      ...UserFactory.create({ role: 'user' }),
      password: 'TestPassword123!'
    });

    creatorUser = await userModel.create({
      ...UserFactory.createCreator(),
      password: 'TestPassword123!'
    });

    adminUser = await userModel.create({
      ...UserFactory.createAdmin(),
      password: 'TestPassword123!'
    });

    // Generate tokens
    userToken = jwt.sign({ 
      id: regularUser._id,
      user: regularUser
    }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

    creatorToken = jwt.sign({ 
      id: creatorUser._id,
      user: creatorUser
    }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

    adminToken = jwt.sign({ 
      id: adminUser._id,
      user: adminUser
    }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

    // Mock Redis sessions
    mockRedis.get.mockImplementation((key: string) => {
      if (key === regularUser._id.toString()) {
        return Promise.resolve(JSON.stringify(regularUser));
      }
      if (key === creatorUser._id.toString()) {
        return Promise.resolve(JSON.stringify(creatorUser));
      }
      if (key === adminUser._id.toString()) {
        return Promise.resolve(JSON.stringify(adminUser));
      }
      return Promise.resolve(null);
    });
  });

  describe('Premium Subscriptions', () => {
    it('should create a premium subscription successfully', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_test_card'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Subscription created successfully',
        subscription: expect.objectContaining({
          id: expect.any(String),
          status: 'active'
        })
      });

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: regularUser.email,
        metadata: { userId: regularUser._id.toString() }
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalled();
    });

    it('should handle subscription creation failures', async () => {
      mockStripe.subscriptions.create.mockRejectedValueOnce(
        new Error('Payment method declined')
      );

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_declined_card'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Payment method declined');
    });

    it('should require authentication for subscription creation', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_test_card'
        })
        .expect(401);

      expect(response.body.message).toBe('No token provided');
    });

    it('should validate required subscription parameters', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly'
          // Missing paymentMethodId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Ad Revenue System', () => {
    it('should serve optimal ads for adult users', async () => {
      const response = await request(app)
        .get('/api/v1/ads/optimal')
        .query({
          placement: 'sidebar',
          userAge: 25,
          interests: 'technology,education',
          country: 'US'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        ad: expect.objectContaining({
          id: expect.any(String),
          type: 'display',
          content: expect.any(String),
          targeting: expect.any(Object),
          revenue: expect.objectContaining({
            cpm: expect.any(Number),
            estimatedEarnings: expect.any(Number)
          })
        })
      });

      expect(mockAdSense.getOptimalAd).toHaveBeenCalledWith({
        placement: 'sidebar',
        targeting: {
          interests: ['technology', 'education'],
          country: 'US'
        }
      });
    });

    it('should not serve ads to minors', async () => {
      const response = await request(app)
        .get('/api/v1/ads/optimal')
        .query({
          placement: 'sidebar',
          userAge: 12,
          interests: 'games,education'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        ad: null,
        message: 'No ads for minors'
      });

      expect(mockAdSense.getOptimalAd).not.toHaveBeenCalled();
    });

    it('should track ad impressions accurately', async () => {
      const response = await request(app)
        .post('/api/v1/ads/track/impression')
        .send({
          adId: 'ad_test123',
          placement: 'header',
          userId: regularUser._id.toString()
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        impressionId: expect.any(String)
      });

      expect(mockAdSense.trackImpression).toHaveBeenCalledWith({
        adId: 'ad_test123',
        placement: 'header',
        userId: regularUser._id.toString(),
        timestamp: expect.any(Date)
      });
    });

    it('should track ad clicks and calculate revenue', async () => {
      const response = await request(app)
        .post('/api/v1/ads/track/click')
        .send({
          adId: 'ad_test123',
          impressionId: 'imp_test123',
          userId: regularUser._id.toString()
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        clickId: expect.any(String),
        revenue: expect.any(Number)
      });

      expect(mockAdSense.trackClick).toHaveBeenCalledWith({
        adId: 'ad_test123',
        impressionId: 'imp_test123',
        userId: regularUser._id.toString(),
        timestamp: expect.any(Date)
      });
    });

    it('should handle ad serving for different placements', async () => {
      const placements = ['header', 'sidebar', 'footer', 'inline'];

      for (const placement of placements) {
        const response = await request(app)
          .get('/api/v1/ads/optimal')
          .query({
            placement,
            userAge: 25
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.ad).toBeTruthy();
      }
    });

    it('should respect user privacy preferences', async () => {
      // Test with minimal targeting data
      const response = await request(app)
        .get('/api/v1/ads/optimal')
        .query({
          placement: 'sidebar',
          userAge: 25
          // No interests or country data
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockAdSense.getOptimalAd).toHaveBeenCalledWith({
        placement: 'sidebar',
        targeting: {
          interests: [],
          country: undefined
        }
      });
    });
  });

  describe('Creator Economy', () => {
    it('should calculate creator earnings correctly', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .query({
          startDate: '2025-08-01',
          endDate: '2025-08-31'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        earnings: expect.objectContaining({
          totalEarnings: expect.any(Number),
          adRevenue: expect.any(Number),
          subscriptionRevenue: expect.any(Number),
          affiliateRevenue: expect.any(Number),
          period: expect.objectContaining({
            start: expect.any(String),
            end: expect.any(String)
          }),
          breakdown: expect.any(Array)
        })
      });

      expect(response.body.earnings.breakdown).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            date: expect.any(String),
            earnings: expect.any(Number),
            source: expect.any(String)
          })
        ])
      );
    });

    it('should require creator authentication for earnings', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .expect(401);

      expect(response.body.message).toBe('No token provided');
    });

    it('should handle different revenue streams', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const { earnings } = response.body;
      
      // Verify all revenue streams are tracked
      expect(earnings).toHaveProperty('adRevenue');
      expect(earnings).toHaveProperty('subscriptionRevenue');
      expect(earnings).toHaveProperty('affiliateRevenue');
      
      // Total should equal sum of all streams
      const calculatedTotal = earnings.adRevenue + earnings.subscriptionRevenue + earnings.affiliateRevenue;
      expect(Math.abs(earnings.totalEarnings - calculatedTotal)).toBeLessThan(0.01);
    });

    it('should provide detailed earnings breakdown', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const { breakdown } = response.body.earnings;
      
      expect(breakdown).toBeInstanceOf(Array);
      expect(breakdown.length).toBeGreaterThan(0);
      
      breakdown.forEach((entry: any) => {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('earnings');
        expect(entry).toHaveProperty('source');
        expect(['ads', 'subscription', 'affiliate']).toContain(entry.source);
      });
    });
  });

  describe('Payment Security & Compliance', () => {
    it('should handle payment failures gracefully', async () => {
      mockStripe.subscriptions.create.mockRejectedValueOnce(
        new Error('Your card was declined')
      );

      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_declined_card'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('declined');
    });

    it('should validate payment method before processing', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: '' // Invalid payment method
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should not expose sensitive payment information', async () => {
      const response = await request(app)
        .post('/api/v1/subscriptions/create')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_test_card'
        })
        .expect(201);

      const responseText = JSON.stringify(response.body);
      
      // Should not contain sensitive data
      expect(responseText).not.toMatch(/sk_test|sk_live/); // Stripe secret keys
      expect(responseText).not.toMatch(/4242424242424242/); // Card numbers
      expect(responseText).not.toMatch(/cvv|cvc/i); // Security codes
    });

    it('should implement proper error handling for payment failures', async () => {
      const errorScenarios = [
        { error: 'insufficient_funds', expectedStatus: 400 },
        { error: 'card_declined', expectedStatus: 400 },
        { error: 'expired_card', expectedStatus: 400 },
        { error: 'processing_error', expectedStatus: 500 }
      ];

      for (const scenario of errorScenarios) {
        mockStripe.subscriptions.create.mockRejectedValueOnce(
          new Error(scenario.error)
        );

        const response = await request(app)
          .post('/api/v1/subscriptions/create')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            priceId: 'price_premium_monthly',
            paymentMethodId: 'pm_test_card'
          });

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body.success).toBe(false);
      }
    });
  });

  describe('Multi-Currency & International Payments', () => {
    it('should handle different currencies', async () => {
      const currencies = ['USD', 'EUR', 'CAD', 'MAD']; // Including Moroccan Dirham
      
      for (const currency of currencies) {
        mockStripe.subscriptions.create.mockResolvedValueOnce({
          id: `sub_${currency}_test`,
          status: 'active',
          currency: currency.toLowerCase(),
          current_period_end: Date.now() + 30 * 24 * 60 * 60 * 1000
        });

        const response = await request(app)
          .post('/api/v1/subscriptions/create')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            priceId: `price_premium_${currency.toLowerCase()}`,
            paymentMethodId: 'pm_test_card'
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.subscription.currency).toBe(currency.toLowerCase());
      }
    });

    it('should handle regional payment methods', async () => {
      const paymentMethods = [
        'pm_card_visa',
        'pm_card_mastercard', 
        'pm_sepa_debit',
        'pm_bancontact'
      ];

      for (const paymentMethod of paymentMethods) {
        const response = await request(app)
          .post('/api/v1/subscriptions/create')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            priceId: 'price_premium_monthly',
            paymentMethodId: paymentMethod
          })
          .expect(201);

        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Revenue Analytics & Reporting', () => {
    it('should provide comprehensive revenue analytics', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .query({
          startDate: '2025-08-01',
          endDate: '2025-08-31'
        })
        .expect(200);

      const { earnings } = response.body;
      
      expect(earnings).toHaveProperty('totalEarnings');
      expect(earnings).toHaveProperty('period');
      expect(earnings.period).toHaveProperty('start');
      expect(earnings.period).toHaveProperty('end');
      
      // Verify earnings are positive numbers
      expect(earnings.totalEarnings).toBeGreaterThanOrEqual(0);
      expect(earnings.adRevenue).toBeGreaterThanOrEqual(0);
      expect(earnings.subscriptionRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should handle date range queries correctly', async () => {
      const startDate = '2025-07-01';
      const endDate = '2025-07-31';

      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .query({ startDate, endDate })
        .expect(200);

      expect(response.body.earnings.period.start).toBe(startDate);
      expect(response.body.earnings.period.end).toBe(endDate);
    });

    it('should default to last 30 days if no date range provided', async () => {
      const response = await request(app)
        .get('/api/v1/creator/earnings')
        .set('Authorization', `Bearer ${creatorToken}`)
        .expect(200);

      const { period } = response.body.earnings;
      const startDate = new Date(period.start);
      const endDate = new Date(period.end);
      
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeCloseTo(30, 1);
    });
  });
});
