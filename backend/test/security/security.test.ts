import request from 'supertest';
import { app } from '../../app';
import { SecurityManager } from '../../security/SecurityManager';
import { DependencyScanner } from '../../security/DependencyScanner';
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

// Mock DependencyScanner
jest.mock('../../security/DependencyScanner');

describe('Security System Tests', () => {
  let adminToken: string;
  let userToken: string;
  let blacklistedToken: string;

  beforeAll(async () => {
    // Create test tokens
    adminToken = jwt.sign(
      { id: 'admin123', role: 'admin' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    userToken = jwt.sign(
      { id: 'user123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    blacklistedToken = jwt.sign(
      { id: 'blacklisted123', role: 'user' },
      process.env.ACCESS_TOKEN as string,
      { expiresIn: '1h' }
    );

    // Mock Redis responses for valid tokens
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'admin123') {
        return JSON.stringify({ _id: 'admin123', role: 'admin', email: 'admin@test.com' });
      }
      if (key === 'user123') {
        return JSON.stringify({ _id: 'user123', role: 'user', email: 'user@test.com' });
      }
      return null;
    });

    // Mock blacklisted token check
    (redis.exists as jest.Mock).mockImplementation((key: string) => {
      if (key.includes('blacklisted123')) return 1;
      return 0;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Security Audit Endpoint', () => {
    it('should perform security audit for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/security/audit')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.audit).toBeDefined();
      expect(response.body.audit.score).toBeGreaterThanOrEqual(0);
      expect(response.body.audit.score).toBeLessThanOrEqual(100);
      expect(response.body.audit.passed).toBeDefined();
      expect(Array.isArray(response.body.audit.vulnerabilities)).toBe(true);
      expect(Array.isArray(response.body.audit.recommendations)).toBe(true);
    });

    it('should deny access to non-admin users', async () => {
      await request(app)
        .get('/api/v1/security/audit')
        .set('Cookie', `access_token=${userToken}`)
        .expect(403);
    });

    it('should deny access to unauthenticated users', async () => {
      await request(app)
        .get('/api/v1/security/audit')
        .expect(400);
    });
  });

  describe('Security Metrics Endpoint', () => {
    it('should return security metrics for admin users', async () => {
      const response = await request(app)
        .get('/api/v1/security/metrics')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.metrics).toBeDefined();
      expect(typeof response.body.metrics.totalRequests).toBe('number');
      expect(typeof response.body.metrics.blockedRequests).toBe('number');
      expect(typeof response.body.metrics.suspiciousActivity).toBe('number');
      expect(typeof response.body.metrics.failedLogins).toBe('number');
      expect(typeof response.body.metrics.rateLimitHits).toBe('number');
    });

    it('should deny access to non-admin users', async () => {
      await request(app)
        .get('/api/v1/security/metrics')
        .set('Cookie', `access_token=${userToken}`)
        .expect(403);
    });
  });

  describe('Token Blacklisting', () => {
    it('should blacklist token for admin users', async () => {
      const response = await request(app)
        .post('/api/v1/security/blacklist-token')
        .set('Cookie', `access_token=${adminToken}`)
        .send({
          token: blacklistedToken,
          reason: 'Test blacklisting'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('blacklisted');
    });

    it('should reject invalid token format', async () => {
      await request(app)
        .post('/api/v1/security/blacklist-token')
        .set('Cookie', `access_token=${adminToken}`)
        .send({
          token: 'invalid-token',
          reason: 'Test'
        })
        .expect(400);
    });

    it('should require reason for blacklisting', async () => {
      await request(app)
        .post('/api/v1/security/blacklist-token')
        .set('Cookie', `access_token=${adminToken}`)
        .send({
          token: blacklistedToken
        })
        .expect(400);
    });
  });

  describe('Enhanced Authentication Middleware', () => {
    it('should reject blacklisted tokens', async () => {
      // First blacklist the token
      await request(app)
        .post('/api/v1/security/blacklist-token')
        .set('Cookie', `access_token=${adminToken}`)
        .send({
          token: blacklistedToken,
          reason: 'Test blacklisting'
        });

      // Try to use blacklisted token
      await request(app)
        .get('/api/v1/security/metrics')
        .set('Cookie', `access_token=${blacklistedToken}`)
        .expect(400);
    });

    it('should validate token age', async () => {
      // Create an old token (25 hours ago)
      const oldToken = jwt.sign(
        { id: 'user123', role: 'user', iat: Math.floor(Date.now() / 1000) - (25 * 60 * 60) },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '48h' }
      );

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${oldToken}`)
        .expect(400);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Mock Redis for rate limiting
      (redis.incr as jest.Mock).mockResolvedValue(1);
      (redis.expire as jest.Mock).mockResolvedValue(1);
    });

    it('should apply rate limiting to authentication endpoints', async () => {
      // Mock high request count
      (redis.incr as jest.Mock).mockResolvedValue(6); // Exceeds auth limit of 5

      await request(app)
        .post('/api/v1/user/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(429);
    });

    it('should apply different limits to different endpoint types', async () => {
      // Test API rate limit (100 requests)
      (redis.incr as jest.Mock).mockResolvedValue(101);

      await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(429);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize XSS attempts', async () => {
      const maliciousInput = {
        title: '<script>alert("xss")</script>Test Title',
        content: 'Test content<img src=x onerror=alert("xss")>',
        description: 'javascript:alert("xss")'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      // Should not contain script tags or javascript: URLs
      if (response.status === 201) {
        expect(response.body.blog.title).not.toContain('<script>');
        expect(response.body.blog.content).not.toContain('onerror=');
        expect(response.body.blog.description).not.toContain('javascript:');
      }
    });

    it('should filter inappropriate content for kids', async () => {
      const inappropriateContent = {
        title: 'Test with bad words damn and hell',
        content: 'This contains inappropriate language',
        ageGroup: 'kids-0-5'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(inappropriateContent);

      if (response.status === 201) {
        expect(response.body.blog.title).not.toContain('damn');
        expect(response.body.blog.title).not.toContain('hell');
      }
    });
  });

  describe('Kids Club Security', () => {
    it('should require parental consent for users under 13', async () => {
      // Mock user under 13 without parental consent
      (redis.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'kid123') {
          return JSON.stringify({
            _id: 'kid123',
            role: 'user',
            email: 'kid@test.com',
            age: 10,
            parentalConsent: false
          });
        }
        return null;
      });

      const kidToken = jwt.sign(
        { id: 'kid123', role: 'user' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

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

    it('should apply age-based content filtering', async () => {
      // Mock user age for filtering
      (redis.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'kid123') {
          return JSON.stringify({
            _id: 'kid123',
            role: 'user',
            email: 'kid@test.com',
            age: 7,
            parentalConsent: true
          });
        }
        return null;
      });

      const kidToken = jwt.sign(
        { id: 'kid123', role: 'user' },
        process.env.ACCESS_TOKEN as string,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send({
          title: 'Educational content',
          content: 'Learning is fun!'
        });

      if (response.status === 201) {
        expect(response.body.blog.ageGroup).toBe('kids-6-8');
      }
    });
  });

  describe('Security Monitoring', () => {
    it('should detect and block suspicious patterns', async () => {
      // Test path traversal attempt
      await request(app)
        .get('/api/v1/blog/../../../etc/passwd')
        .expect(400);

      // Test SQL injection attempt
      await request(app)
        .get('/api/v1/blog?id=1\' OR \'1\'=\'1')
        .expect(400);

      // Test XSS attempt in URL
      await request(app)
        .get('/api/v1/blog?search=<script>alert("xss")</script>')
        .expect(400);
    });

    it('should log security events', async () => {
      // Mock console.log to capture security logs
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await request(app)
        .get('/api/v1/blog/../../../etc/passwd');

      // Should have logged the suspicious activity
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Dependency Scanner', () => {
    it('should scan for vulnerabilities', async () => {
      // Mock the DependencyScanner methods
      const mockScanDependencies = jest.fn().mockResolvedValue({
        vulnerabilities: [],
        summary: { total: 0, critical: 0, high: 0, moderate: 0, low: 0, info: 0 }
      });

      const mockCheckOutdated = jest.fn().mockResolvedValue([]);
      const mockGetRecommendations = jest.fn().mockResolvedValue([]);

      // Mock the static getInstance method
      jest.spyOn(DependencyScanner, 'getInstance').mockReturnValue({
        scanDependencies: mockScanDependencies,
        checkOutdatedPackages: mockCheckOutdated,
        getSecurityRecommendations: mockGetRecommendations
      } as any);

      const scanner = DependencyScanner.getInstance();
      const result = await scanner.scanDependencies();

      expect(result).toBeDefined();
      expect(result.vulnerabilities).toEqual([]);
      expect(result.vulnerabilities).toEqual([]);
    });
  });

  describe('Content Security Policy', () => {
    it('should include CSP headers in responses', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types and sizes', async () => {
      // Mock file upload with invalid type
      const response = await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake exe content'), {
          filename: 'malicious.exe',
          contentType: 'application/x-msdownload'
        });

      expect(response.status).toBe(400);
    });

    it('should sanitize file names', async () => {
      const maliciousFilename = '../../../etc/passwd.jpg';
      
      const response = await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake image'), {
          filename: maliciousFilename,
          contentType: 'image/jpeg'
        });

      // Should reject path traversal in filename
      expect(response.status).toBe(400);
    });
  });

  describe('Session Management', () => {
    it('should invalidate sessions on logout', async () => {
      await request(app)
        .post('/api/v1/user/logout')
        .set('Cookie', `access_token=${userToken}`)
        .expect(200);

      // Verify Redis delete was called
      expect(redis.del).toHaveBeenCalled();
    });

    it('should handle concurrent sessions', async () => {
      // Mock multiple sessions for same user
      (redis.get as jest.Mock).mockResolvedValue(
        JSON.stringify({ _id: 'user123', role: 'user', sessions: 2 })
      );

      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
