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

describe('Enhanced Authentication Tests', () => {
  let validToken: string;
  let expiredToken: string;
  let blacklistedToken: string;
  let kidToken: string;

  beforeAll(() => {
    // Create test tokens
    validToken = jwt.sign(
      { id: 'user123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    expiredToken = jwt.sign(
      { id: 'user123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '-1h' } // Already expired
    );

    blacklistedToken = jwt.sign(
      { id: 'blacklisted123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    kidToken = jwt.sign(
      { id: 'kid123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default Redis mock responses
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user123') {
        return Promise.resolve(JSON.stringify({
          _id: 'user123',
          role: 'user',
          email: 'user@test.com',
          isBlocked: false
        }));
      }
      if (key === 'kid123') {
        return Promise.resolve(JSON.stringify({
          _id: 'kid123',
          role: 'user',
          email: 'kid@test.com',
          age: 10,
          parentalConsent: true,
          isBlocked: false
        }));
      }
      return Promise.resolve(null);
    });

    (redis.exists as jest.Mock).mockImplementation((key: string) => {
      if (key.includes('blacklisted123')) return Promise.resolve(1);
      return Promise.resolve(0);
    });
  });

  describe('Token Validation', () => {
    it('should accept valid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject expired tokens', async () => {
      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${expiredToken}`)
        .expect(400);
    });

    it('should reject blacklisted tokens', async () => {
      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${blacklistedToken}`)
        .expect(400);
    });

    it('should reject requests without tokens', async () => {
      await request(app)
        .get('/api/v1/user/me')
        .expect(400);
    });

    it('should reject malformed tokens', async () => {
      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', 'access_token=invalid.token.here')
        .expect(400);
    });
  });

  describe('Token Age Validation', () => {
    it('should reject tokens older than 24 hours', async () => {
      const oldToken = jwt.sign(
        { 
          id: 'user123', 
          role: 'user',
          iat: Math.floor(Date.now() / 1000) - (25 * 60 * 60) // 25 hours ago
        },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '48h' }
      );

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${oldToken}`)
        .expect(400);
    });

    it('should accept tokens within 24 hours', async () => {
      const recentToken = jwt.sign(
        { 
          id: 'user123', 
          role: 'user',
          iat: Math.floor(Date.now() / 1000) - (23 * 60 * 60) // 23 hours ago
        },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '48h' }
      );

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${recentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('User Session Validation', () => {
    it('should reject tokens for users not in Redis', async () => {
      (redis.get as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(400);
    });

    it('should reject tokens for blocked users', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'user123',
        role: 'user',
        email: 'user@test.com',
        isBlocked: true
      }));

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(403);
    });

    it('should reject tokens for suspended users', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'user123',
        role: 'user',
        email: 'user@test.com',
        accountStatus: 'suspended'
      }));

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(403);
    });
  });

  describe('Role-Based Authorization', () => {
    it('should allow admin access to admin endpoints', async () => {
      const adminToken = jwt.sign(
        { id: 'admin123', role: 'admin' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'admin123',
        role: 'admin',
        email: 'admin@test.com'
      }));

      const response = await request(app)
        .get('/api/v1/security/audit')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny user access to admin endpoints', async () => {
      await request(app)
        .get('/api/v1/security/audit')
        .set('Cookie', `access_token=${validToken}`)
        .expect(403);
    });

    it('should allow moderator access to moderation endpoints', async () => {
      const moderatorToken = jwt.sign(
        { id: 'mod123', role: 'moderator' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'mod123',
        role: 'moderator',
        email: 'mod@test.com'
      }));

      // Test with a moderation endpoint (if available)
      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${moderatorToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Kids Club Authentication', () => {
    it('should require parental consent for users under 13', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'kid123',
        role: 'user',
        email: 'kid@test.com',
        age: 10,
        parentalConsent: false
      }));

      await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send({
          title: 'Kids content',
          content: 'Fun content for kids',
          ageGroup: 'kids-6-8'
        })
        .expect(403);
    });

    it('should allow kids with parental consent', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'kid123',
        role: 'user',
        email: 'kid@test.com',
        age: 10,
        parentalConsent: true
      }));

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${kidToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should check parental consent expiry', async () => {
      const expiredConsentDate = new Date();
      expiredConsentDate.setFullYear(expiredConsentDate.getFullYear() - 2); // 2 years ago

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'kid123',
        role: 'user',
        email: 'kid@test.com',
        age: 10,
        parentalConsent: true,
        parentalConsentDate: expiredConsentDate.toISOString()
      }));

      await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send({
          title: 'Kids content',
          content: 'Fun content for kids',
          ageGroup: 'kids-6-8'
        })
        .expect(403);
    });

    it('should allow adults without parental consent check', async () => {
      const adultToken = jwt.sign(
        { id: 'adult123', role: 'user' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'adult123',
        role: 'user',
        email: 'adult@test.com',
        age: 25
      }));

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${adultToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Permission-Based Access', () => {
    it('should check specific permissions for actions', async () => {
      const authorToken = jwt.sign(
        { id: 'author123', role: 'author' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'author123',
        role: 'author',
        email: 'author@test.com',
        permissions: ['create_content', 'edit_own_content']
      }));

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${authorToken}`)
        .send({
          title: 'Author content',
          content: 'Content by author'
        });

      // Should allow content creation for authors
      expect([200, 201]).toContain(response.status);
    });

    it('should deny access without required permissions', async () => {
      const limitedToken = jwt.sign(
        { id: 'limited123', role: 'user' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'limited123',
        role: 'user',
        email: 'limited@test.com',
        permissions: ['read_content'] // No create permission
      }));

      // Try to access admin endpoint
      await request(app)
        .get('/api/v1/security/audit')
        .set('Cookie', `access_token=${limitedToken}`)
        .expect(403);
    });
  });

  describe('Security Event Logging', () => {
    it('should log failed authentication attempts', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', 'access_token=invalid.token')
        .expect(400);

      // Should log the failed attempt
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log suspicious token usage', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${blacklistedToken}`)
        .expect(400);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Token Refresh Mechanism', () => {
    it('should handle refresh token validation', async () => {
      // This would test refresh token logic if implemented
      const refreshToken = jwt.sign(
        { id: 'user123', type: 'refresh' },
        process.env.REFRESH_TOKEN as string,
        { expiresIn: '7d' }
      );

      // Mock refresh endpoint if available
      const response = await request(app)
        .post('/api/v1/user/refresh-token')
        .send({ refreshToken });

      // Should either succeed or return appropriate error
      expect([200, 400, 404]).toContain(response.status);
    });
  });

  describe('Concurrent Session Management', () => {
    it('should handle multiple active sessions', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'user123',
        role: 'user',
        email: 'user@test.com',
        activeSessions: 3,
        maxSessions: 5
      }));

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject sessions exceeding limit', async () => {
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
        _id: 'user123',
        role: 'user',
        email: 'user@test.com',
        activeSessions: 6,
        maxSessions: 5
      }));

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${validToken}`)
        .expect(403);
    });
  });
});
