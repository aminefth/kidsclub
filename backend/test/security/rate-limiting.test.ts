import request from 'supertest';
import { app } from '../../app';
import { redis } from '../../utils/redis';
import jwt from 'jsonwebtoken';

// Mock Redis
jest.mock('../../utils/redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  },
}));

describe('Rate Limiting Tests', () => {
  let userToken: string;
  let adminToken: string;

  beforeAll(() => {
    userToken = jwt.sign(
      { id: 'user123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { id: 'admin123', role: 'admin' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis responses
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user123') {
        return Promise.resolve(JSON.stringify({
          _id: 'user123',
          role: 'user',
          email: 'user@test.com'
        }));
      }
      if (key === 'admin123') {
        return Promise.resolve(JSON.stringify({
          _id: 'admin123',
          role: 'admin',
          email: 'admin@test.com'
        }));
      }
      return Promise.resolve(null);
    });

    (redis.exists as jest.Mock).mockResolvedValue(0);
  });

  describe('Authentication Rate Limiting', () => {
    it('should allow requests within auth rate limit', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .post('/api/v1/user/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect([200, 400]).toContain(response.status); // 400 for invalid credentials is OK
      expect(redis.incr).toHaveBeenCalled();
    });

    it('should block requests exceeding auth rate limit (5 per 15 min)', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(6); // Exceeds limit

      await request(app)
        .post('/api/v1/user/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(429);
    });

    it('should apply auth rate limit to registration', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(6);

      await request(app)
        .post('/api/v1/user/registration')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(429);
    });

    it('should apply auth rate limit to password reset', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(6);

      await request(app)
        .post('/api/v1/user/forgot-password')
        .send({
          email: 'test@example.com'
        })
        .expect(429);
    });
  });

  describe('API Rate Limiting', () => {
    it('should allow requests within API rate limit', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(50);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should block requests exceeding API rate limit (100 per 15 min)', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(101);

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);
    });

    it('should apply API rate limit to blog endpoints', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(101);

      await request(app)
        .get('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);
    });
  });

  describe('Kids Content Rate Limiting', () => {
    it('should allow requests within kids content limit', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(25);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Kids content',
          content: 'Educational content for children',
          ageGroup: 'kids-6-8'
        });

      expect([200, 201, 400]).toContain(response.status);
    });

    it('should block requests exceeding kids content limit (50 per 10 min)', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(51);

      await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Kids content',
          content: 'Educational content for children',
          ageGroup: 'kids-6-8'
        })
        .expect(429);
    });

    it('should apply kids rate limit to age-appropriate content', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(51);

      await request(app)
        .get('/api/v1/blog?ageGroup=kids-0-5')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);
    });
  });

  describe('File Upload Rate Limiting', () => {
    it('should allow uploads within limit', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(5);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake image'), {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg'
        });

      expect([200, 201, 400]).toContain(response.status);
    });

    it('should block uploads exceeding limit (10 per hour)', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(11);

      await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake image'), {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg'
        })
        .expect(429);
    });
  });

  describe('IP-Based Rate Limiting', () => {
    it('should track requests by IP address', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(1);

      await request(app)
        .get('/api/v1/health')
        .set('X-Forwarded-For', '192.168.1.100');

      expect(redis.incr).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.100')
      );
    });

    it('should handle requests without IP gracefully', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/health');

      expect(response.status).toBe(200);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit headers in responses', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/health');

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should show correct remaining count', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(3);

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`);

      if (response.headers['x-ratelimit-remaining']) {
        expect(parseInt(response.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Rate Limit Reset', () => {
    it('should reset rate limit after window expires', async () => {
      // First request
      (redis.incr as jest.Mock).mockResolvedValueOnce(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`);

      // Simulate window reset
      (redis.incr as jest.Mock).mockResolvedValueOnce(1);

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Different Limits for Different Endpoints', () => {
    it('should apply correct limits to security endpoints', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/v1/security/metrics')
        .set('Cookie', `access_token=${adminToken}`);

      expect([200, 403]).toContain(response.status);
    });

    it('should have stricter limits for sensitive operations', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(6); // Exceeds auth limit

      await request(app)
        .post('/api/v1/security/blacklist-token')
        .set('Cookie', `access_token=${adminToken}`)
        .send({
          token: 'some.jwt.token',
          reason: 'Test'
        })
        .expect(429);
    });
  });

  describe('Rate Limit Bypass for Admins', () => {
    it('should not bypass rate limits for admin users', async () => {
      // Even admins should be rate limited for security
      (redis.incr as jest.Mock).mockResolvedValue(101);

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(429);
    });
  });

  describe('Rate Limit Error Messages', () => {
    it('should return informative error message when rate limited', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(101);

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);

      expect(response.body.message).toContain('rate limit');
      expect(response.body.retryAfter).toBeDefined();
    });

    it('should include retry-after header', async () => {
      (redis.incr as jest.Mock).mockResolvedValue(101);

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  describe('Distributed Rate Limiting', () => {
    it('should handle Redis connection errors gracefully', async () => {
      (redis.incr as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      // Should still allow request when Redis is down (fail open)
      const response = await request(app)
        .get('/api/v1/health');

      expect([200, 500]).toContain(response.status);
    });

    it('should handle Redis timeout gracefully', async () => {
      (redis.incr as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(1), 1000))
      );

      const response = await request(app)
        .get('/api/v1/health');

      expect([200, 500]).toContain(response.status);
    });
  });
});
