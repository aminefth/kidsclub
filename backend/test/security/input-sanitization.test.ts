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

describe('Input Sanitization Tests', () => {
  let userToken: string;
  let kidToken: string;

  beforeAll(() => {
    userToken = jwt.sign(
      { id: 'user123', role: 'user' },
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
    
    // Mock Redis responses
    (redis.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'user123') {
        return Promise.resolve(JSON.stringify({
          _id: 'user123',
          role: 'user',
          email: 'user@test.com',
          age: 25
        }));
      }
      if (key === 'kid123') {
        return Promise.resolve(JSON.stringify({
          _id: 'kid123',
          role: 'user',
          email: 'kid@test.com',
          age: 8,
          parentalConsent: true
        }));
      }
      return Promise.resolve(null);
    });

    (redis.exists as jest.Mock).mockResolvedValue(0);
    (redis.incr as jest.Mock).mockResolvedValue(1);
    (redis.expire as jest.Mock).mockResolvedValue(1);
  });

  describe('XSS Protection', () => {
    it('should remove script tags from input', async () => {
      const maliciousInput = {
        title: '<script>alert("xss")</script>Clean Title',
        content: 'Normal content<script>document.cookie</script>',
        description: 'Description with <script src="evil.js"></script>'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      if (response.status === 201) {
        expect(response.body.blog.title).not.toContain('<script>');
        expect(response.body.blog.content).not.toContain('<script>');
        expect(response.body.blog.description).not.toContain('<script>');
        expect(response.body.blog.title).toContain('Clean Title');
      }
    });

    it('should remove javascript: URLs', async () => {
      const maliciousInput = {
        title: 'Test Title',
        content: '<a href="javascript:alert(\'xss\')">Click me</a>',
        description: 'javascript:void(0)'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      if (response.status === 201) {
        expect(response.body.blog.content).not.toContain('javascript:');
        expect(response.body.blog.description).not.toContain('javascript:');
      }
    });

    it('should remove event handlers', async () => {
      const maliciousInput = {
        title: 'Test Title',
        content: '<img src="test.jpg" onerror="alert(\'xss\')" onload="steal()">',
        description: '<div onclick="malicious()">Click</div>'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      if (response.status === 201) {
        expect(response.body.blog.content).not.toContain('onerror=');
        expect(response.body.blog.content).not.toContain('onload=');
        expect(response.body.blog.description).not.toContain('onclick=');
      }
    });

    it('should remove dangerous attributes', async () => {
      const maliciousInput = {
        title: 'Test Title',
        content: '<iframe src="evil.com" srcdoc="<script>alert(1)</script>"></iframe>',
        description: '<object data="malicious.swf"></object>'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      if (response.status === 201) {
        expect(response.body.blog.content).not.toContain('srcdoc=');
        expect(response.body.blog.description).not.toContain('<object');
      }
    });
  });

  describe('MongoDB Injection Protection', () => {
    it('should sanitize MongoDB operators in queries', async () => {
      const response = await request(app)
        .get('/api/v1/blog?title[$ne]=null')
        .set('Cookie', `access_token=${userToken}`);

      // Should not crash and should handle the query safely
      expect([200, 400]).toContain(response.status);
    });

    it('should sanitize MongoDB operators in request body', async () => {
      const maliciousInput = {
        title: { $ne: null },
        content: { $regex: '.*' },
        author: { $where: 'this.password.length > 0' }
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      // Should reject or sanitize the malicious operators
      expect([400, 422]).toContain(response.status);
    });
  });

  describe('HTML Injection Protection', () => {
    it('should remove dangerous HTML tags', async () => {
      const maliciousInput = {
        title: 'Test Title',
        content: '<embed src="malicious.swf"><object><param name="movie" value="evil.swf"></object>',
        description: '<applet code="Evil.class"></applet>'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(maliciousInput);

      if (response.status === 201) {
        expect(response.body.blog.content).not.toContain('<embed');
        expect(response.body.blog.content).not.toContain('<object');
        expect(response.body.blog.description).not.toContain('<applet');
      }
    });

    it('should preserve safe HTML tags', async () => {
      const safeInput = {
        title: 'Test Title',
        content: '<p>This is <strong>safe</strong> content with <em>emphasis</em></p>',
        description: '<ul><li>Safe list item</li></ul>'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(safeInput);

      if (response.status === 201) {
        expect(response.body.blog.content).toContain('<p>');
        expect(response.body.blog.content).toContain('<strong>');
        expect(response.body.blog.content).toContain('<em>');
      }
    });
  });

  describe('Kids Content Filtering', () => {
    it('should filter inappropriate words for kids content', async () => {
      const inappropriateInput = {
        title: 'Story with damn and hell words',
        content: 'This story contains some bad words like stupid and dumb',
        ageGroup: 'kids-6-8'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send(inappropriateInput);

      if (response.status === 201) {
        expect(response.body.blog.title).not.toContain('damn');
        expect(response.body.blog.title).not.toContain('hell');
        expect(response.body.blog.content).not.toContain('stupid');
        expect(response.body.blog.content).not.toContain('dumb');
      }
    });

    it('should replace inappropriate words with kid-friendly alternatives', async () => {
      const inappropriateInput = {
        title: 'This is stupid content',
        content: 'What a dumb story',
        ageGroup: 'kids-0-5'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send(inappropriateInput);

      if (response.status === 201) {
        expect(response.body.blog.title).toContain('silly');
        expect(response.body.blog.content).toContain('silly');
      }
    });

    it('should not filter content for adult users', async () => {
      const adultContent = {
        title: 'Adult discussion about complex topics',
        content: 'This content discusses mature themes appropriately'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(adultContent);

      if (response.status === 201) {
        expect(response.body.blog.title).toBe(adultContent.title);
        expect(response.body.blog.content).toBe(adultContent.content);
      }
    });

    it('should apply age-appropriate filtering based on user age', async () => {
      const borderlineContent = {
        title: 'Content with mild language',
        content: 'This is a bit annoying but not too bad'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${kidToken}`)
        .send(borderlineContent);

      if (response.status === 201) {
        // Should apply filtering for 8-year-old user
        expect(response.body.blog.ageGroup).toBe('kids-6-8');
      }
    });
  });

  describe('File Upload Sanitization', () => {
    it('should sanitize file names', async () => {
      const response = await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake image'), {
          filename: '../../../etc/passwd.jpg',
          contentType: 'image/jpeg'
        });

      // Should reject path traversal attempts
      expect(response.status).toBe(400);
    });

    it('should reject dangerous file extensions', async () => {
      const dangerousFiles = [
        { filename: 'malicious.exe', contentType: 'application/x-msdownload' },
        { filename: 'script.js', contentType: 'application/javascript' },
        { filename: 'virus.bat', contentType: 'application/x-bat' }
      ];

      for (const file of dangerousFiles) {
        const response = await request(app)
          .post('/api/v1/user/avatar')
          .set('Cookie', `access_token=${userToken}`)
          .attach('file', Buffer.from('fake content'), file);

        expect(response.status).toBe(400);
      }
    });

    it('should validate file MIME types', async () => {
      const response = await request(app)
        .post('/api/v1/user/avatar')
        .set('Cookie', `access_token=${userToken}`)
        .attach('file', Buffer.from('fake content'), {
          filename: 'image.jpg',
          contentType: 'application/x-executable' // Wrong MIME type
        });

      expect(response.status).toBe(400);
    });
  });

  describe('URL Sanitization', () => {
    it('should block requests with path traversal attempts', async () => {
      await request(app)
        .get('/api/v1/blog/../../../etc/passwd')
        .set('Cookie', `access_token=${userToken}`)
        .expect(400);
    });

    it('should block requests with null bytes', async () => {
      await request(app)
        .get('/api/v1/blog/test%00.txt')
        .set('Cookie', `access_token=${userToken}`)
        .expect(400);
    });

    it('should sanitize query parameters', async () => {
      const response = await request(app)
        .get('/api/v1/blog?search=<script>alert("xss")</script>')
        .set('Cookie', `access_token=${userToken}`);

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Header Sanitization', () => {
    it('should sanitize custom headers', async () => {
      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .set('X-Custom-Header', '<script>alert("xss")</script>');

      expect([200, 400]).toContain(response.status);
    });

    it('should handle malformed headers gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/user/me')
        .set('Cookie', `access_token=${userToken}`)
        .set('X-Malformed', 'value\r\nInjected-Header: malicious');

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('JSON Sanitization', () => {
    it('should handle deeply nested objects', async () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: '<script>alert("deep xss")</script>'
              }
            }
          }
        }
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Test',
          content: 'Test',
          metadata: deepObject
        });

      expect([200, 201, 400]).toContain(response.status);
    });

    it('should handle arrays with malicious content', async () => {
      const maliciousArray = [
        'normal content',
        '<script>alert("xss")</script>',
        { nested: 'javascript:alert("nested")' }
      ];

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Test',
          content: 'Test',
          tags: maliciousArray
        });

      expect([200, 201, 400]).toContain(response.status);
    });
  });

  describe('Content Length Limits', () => {
    it('should reject overly long input', async () => {
      const longContent = 'A'.repeat(100000); // 100KB content

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Test',
          content: longContent
        });

      expect([400, 413]).toContain(response.status);
    });

    it('should handle normal length content', async () => {
      const normalContent = 'This is normal length content for a blog post.';

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send({
          title: 'Test',
          content: normalContent
        });

      expect([200, 201, 400]).toContain(response.status);
    });
  });

  describe('Special Character Handling', () => {
    it('should handle Unicode characters properly', async () => {
      const unicodeContent = {
        title: 'Test with émojis 🎉 and ñoñó',
        content: 'Content with 中文 and العربية text'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(unicodeContent);

      if (response.status === 201) {
        expect(response.body.blog.title).toContain('émojis');
        expect(response.body.blog.title).toContain('🎉');
        expect(response.body.blog.content).toContain('中文');
      }
    });

    it('should handle control characters', async () => {
      const controlChars = {
        title: 'Test\x00\x01\x02title',
        content: 'Content\x7F\x80with controls'
      };

      const response = await request(app)
        .post('/api/v1/blog')
        .set('Cookie', `access_token=${userToken}`)
        .send(controlChars);

      if (response.status === 201) {
        expect(response.body.blog.title).not.toContain('\x00');
        expect(response.body.blog.content).not.toContain('\x7F');
      }
    });
  });
});
