import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import BlogModel from '../../models/blogs.model';
import { UserFactory } from '../factories/user.factory';
import { BlogFactory } from '../factories/blog.factory';
import { mockRedis } from '../mocks/redis.mock';
import jwt from 'jsonwebtoken';

// Performance testing utilities
class PerformanceMonitor {
  private startTime: number = 0;
  private endTime: number = 0;
  private memoryStart: NodeJS.MemoryUsage = process.memoryUsage();
  private memoryEnd: NodeJS.MemoryUsage = process.memoryUsage();

  start() {
    this.startTime = performance.now();
    this.memoryStart = process.memoryUsage();
  }

  end() {
    this.endTime = performance.now();
    this.memoryEnd = process.memoryUsage();
  }

  getExecutionTime(): number {
    return this.endTime - this.startTime;
  }

  getMemoryUsage() {
    return {
      heapUsedDelta: this.memoryEnd.heapUsed - this.memoryStart.heapUsed,
      heapTotalDelta: this.memoryEnd.heapTotal - this.memoryStart.heapTotal,
      rssUsedDelta: this.memoryEnd.rss - this.memoryStart.rss
    };
  }
}

// Create test app with realistic middleware stack
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mock realistic middleware stack
app.use((req: any, res, next) => {
  // Simulate request logging
  req.startTime = Date.now();
  next();
});

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

// Routes for performance testing
app.get('/api/v1/blogs', async (req: any, res: any) => {
  try {
    const { page = 1, limit = 10, search, category } = req.query;
    
    const filter: any = { isPublished: true };
    if (search) {
      filter.$text = { $search: search };
    }
    if (category) {
      filter.category = category;
    }

    const blogs = await BlogModel.find(filter)
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(); // Use lean() for better performance

    const total = await BlogModel.countDocuments(filter);

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      responseTime: Date.now() - req.startTime
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/blogs', mockAuth, async (req: any, res: any) => {
  try {
    const { title, des, content, tags, category } = req.body;
    
    const blog = await BlogModel.create({
      blog_id: `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      des,
      content: content || [],
      tags: tags || [],
      author: req.user._id,
      category: category || 'General',
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      isPublished: true
    });

    res.status(201).json({
      success: true,
      blog,
      responseTime: Date.now() - req.startTime
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.get('/api/v1/users/search', async (req: any, res: any) => {
  try {
    const { q, limit = 20 } = req.query;
    
    const users = await userModel.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ],
      isDeleted: false
    })
    .select('name username avatar bio')
    .limit(Number(limit))
    .lean();

    res.status(200).json({
      success: true,
      users,
      responseTime: Date.now() - req.startTime
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

describe('Performance & Load Testing', () => {
  let testUsers: any[] = [];
  let testBlogs: any[] = [];
  let authTokens: string[] = [];

  beforeAll(async () => {
    // Create test data for performance testing
    console.log('Setting up performance test data...');
    
    // Create 100 test users
    const userData = UserFactory.createBatch(100);
    testUsers = await userModel.insertMany(userData);
    
    // Generate auth tokens for users
    authTokens = testUsers.map(user => 
      jwt.sign({ 
        id: user._id,
        user: user
      }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' })
    );

    // Create 500 test blogs
    const blogData = testUsers.flatMap(user => 
      BlogFactory.createBatch(5, { 
        authorId: user._id.toString(),
        isPublished: true 
      })
    );
    testBlogs = await BlogModel.insertMany(blogData);

    // Mock Redis for all users
    mockRedis.get.mockImplementation((key: string) => {
      const user = testUsers.find(u => u._id.toString() === key);
      return user ? Promise.resolve(JSON.stringify(user)) : Promise.resolve(null);
    });

    console.log(`Created ${testUsers.length} users and ${testBlogs.length} blogs for testing`);
  }, 60000);

  describe('API Response Time Performance', () => {
    it('should handle blog listing within acceptable time limits', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ page: 1, limit: 20 })
        .expect(200);

      monitor.end();
      const executionTime = monitor.getExecutionTime();

      expect(executionTime).toBeLessThan(500); // Should complete within 500ms
      expect(response.body.success).toBe(true);
      expect(response.body.blogs).toHaveLength(20);
      
      console.log(`Blog listing took ${executionTime.toFixed(2)}ms`);
    });

    it('should handle blog search efficiently', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ 
          search: 'technology',
          page: 1, 
          limit: 10 
        })
        .expect(200);

      monitor.end();
      const executionTime = monitor.getExecutionTime();

      expect(executionTime).toBeLessThan(1000); // Search should complete within 1s
      expect(response.body.success).toBe(true);
      
      console.log(`Blog search took ${executionTime.toFixed(2)}ms`);
    });

    it('should handle user search with reasonable performance', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const response = await request(app)
        .get('/api/v1/users/search')
        .query({ q: 'test', limit: 20 })
        .expect(200);

      monitor.end();
      const executionTime = monitor.getExecutionTime();

      expect(executionTime).toBeLessThan(300); // User search should be fast
      expect(response.body.success).toBe(true);
      
      console.log(`User search took ${executionTime.toFixed(2)}ms`);
    });

    it('should handle blog creation within reasonable time', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send({
          title: 'Performance Test Blog',
          des: 'Testing blog creation performance',
          content: [
            { type: 'paragraph', content: 'Test content for performance' }
          ],
          tags: ['performance', 'testing']
        })
        .expect(201);

      monitor.end();
      const executionTime = monitor.getExecutionTime();

      expect(executionTime).toBeLessThan(1000); // Blog creation within 1s
      expect(response.body.success).toBe(true);
      
      console.log(`Blog creation took ${executionTime.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent blog requests efficiently', async () => {
      const concurrentRequests = 50;
      const monitor = new PerformanceMonitor();
      
      monitor.start();
      
      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .get('/api/v1/blogs')
          .query({ page: Math.floor(i / 10) + 1, limit: 10 })
      );

      const responses = await Promise.all(requests);
      
      monitor.end();
      const totalTime = monitor.getExecutionTime();
      const avgResponseTime = totalTime / concurrentRequests;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
      console.log(`${concurrentRequests} concurrent requests completed in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });

    it('should handle concurrent user searches without performance degradation', async () => {
      const concurrentSearches = 25;
      const searchTerms = ['test', 'user', 'admin', 'creator', 'author'];
      
      const monitor = new PerformanceMonitor();
      monitor.start();

      const requests = Array.from({ length: concurrentSearches }, (_, i) =>
        request(app)
          .get('/api/v1/users/search')
          .query({ q: searchTerms[i % searchTerms.length], limit: 10 })
      );

      const responses = await Promise.all(requests);
      
      monitor.end();
      const totalTime = monitor.getExecutionTime();

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(totalTime).toBeLessThan(5000); // All searches within 5s
      console.log(`${concurrentSearches} concurrent searches completed in ${totalTime.toFixed(2)}ms`);
    });

    it('should maintain performance under mixed workload', async () => {
      const monitor = new PerformanceMonitor();
      monitor.start();

      // Mixed workload: reads and writes
      const readRequests = Array.from({ length: 30 }, () =>
        request(app).get('/api/v1/blogs').query({ page: 1, limit: 10 })
      );

      const writeRequests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/blogs')
          .set('Authorization', `Bearer ${authTokens[i]}`)
          .send({
            title: `Concurrent Blog ${i}`,
            des: `Performance test blog ${i}`,
            tags: ['performance', 'test']
          })
      );

      const searchRequests = Array.from({ length: 10 }, () =>
        request(app).get('/api/v1/users/search').query({ q: 'test', limit: 5 })
      );

      const allRequests = [...readRequests, ...writeRequests, ...searchRequests];
      const responses = await Promise.all(allRequests);

      monitor.end();
      const totalTime = monitor.getExecutionTime();

      // All requests should succeed
      const successCount = responses.filter(r => r.status < 400).length;
      expect(successCount).toBe(allRequests.length);

      expect(totalTime).toBeLessThan(10000); // Mixed workload within 10s
      console.log(`Mixed workload (${allRequests.length} requests) completed in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage & Resource Management', () => {
    it('should not cause memory leaks during repeated operations', async () => {
      const iterations = 100;
      const monitor = new PerformanceMonitor();
      
      monitor.start();
      
      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/v1/blogs')
          .query({ page: 1, limit: 10 });
      }
      
      monitor.end();
      const memoryUsage = monitor.getMemoryUsage();

      // Memory usage should be reasonable
      expect(memoryUsage.heapUsedDelta).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase
      
      console.log(`Memory usage after ${iterations} requests:`, {
        heapUsedDelta: `${(memoryUsage.heapUsedDelta / 1024 / 1024).toFixed(2)}MB`,
        rssUsedDelta: `${(memoryUsage.rssUsedDelta / 1024 / 1024).toFixed(2)}MB`
      });
    });

    it('should handle large content efficiently', async () => {
      const largeContent = Array.from({ length: 100 }, (_, i) => ({
        type: 'paragraph',
        content: `Large paragraph ${i + 1}: ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20)}`
      }));

      const monitor = new PerformanceMonitor();
      monitor.start();

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authTokens[0]}`)
        .send({
          title: 'Large Content Blog',
          des: 'Testing large content handling',
          content: largeContent,
          tags: ['performance', 'large-content']
        })
        .expect(201);

      monitor.end();
      const executionTime = monitor.getExecutionTime();
      const memoryUsage = monitor.getMemoryUsage();

      expect(executionTime).toBeLessThan(3000); // Should handle large content within 3s
      expect(response.body.success).toBe(true);
      
      console.log(`Large content handling took ${executionTime.toFixed(2)}ms, memory delta: ${(memoryUsage.heapUsedDelta / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Database Query Performance', () => {
    it('should handle pagination efficiently for large datasets', async () => {
      const pages = [1, 5, 10, 20, 50];
      
      for (const page of pages) {
        const monitor = new PerformanceMonitor();
        monitor.start();

        const response = await request(app)
          .get('/api/v1/blogs')
          .query({ page, limit: 20 })
          .expect(200);

        monitor.end();
        const executionTime = monitor.getExecutionTime();

        expect(executionTime).toBeLessThan(1000); // Each page within 1s
        expect(response.body.blogs).toHaveLength(Math.min(20, Math.max(0, testBlogs.length - (page - 1) * 20)));
        
        console.log(`Page ${page} loaded in ${executionTime.toFixed(2)}ms`);
      }
    });

    it('should handle complex filtering without performance degradation', async () => {
      const filters = [
        { category: 'Technology' },
        { search: 'test' },
        { category: 'Education', search: 'learning' }
      ];

      for (const filter of filters) {
        const monitor = new PerformanceMonitor();
        monitor.start();

        const response = await request(app)
          .get('/api/v1/blogs')
          .query({ ...filter, page: 1, limit: 10 })
          .expect(200);

        monitor.end();
        const executionTime = monitor.getExecutionTime();

        expect(executionTime).toBeLessThan(1500); // Complex queries within 1.5s
        expect(response.body.success).toBe(true);
        
        console.log(`Filter ${JSON.stringify(filter)} took ${executionTime.toFixed(2)}ms`);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should maintain stability under high load', async () => {
      const highLoadRequests = 100;
      const batchSize = 20;
      const batches = Math.ceil(highLoadRequests / batchSize);
      
      console.log(`Running stress test with ${highLoadRequests} requests in ${batches} batches`);
      
      const monitor = new PerformanceMonitor();
      monitor.start();

      for (let batch = 0; batch < batches; batch++) {
        const batchRequests = Array.from({ length: Math.min(batchSize, highLoadRequests - batch * batchSize) }, () =>
          request(app)
            .get('/api/v1/blogs')
            .query({ page: Math.floor(Math.random() * 10) + 1, limit: 10 })
        );

        const batchResponses = await Promise.all(batchRequests);
        
        // All requests in batch should succeed
        batchResponses.forEach(response => {
          expect(response.status).toBe(200);
        });

        console.log(`Batch ${batch + 1}/${batches} completed`);
      }

      monitor.end();
      const totalTime = monitor.getExecutionTime();
      const avgResponseTime = totalTime / highLoadRequests;

      expect(avgResponseTime).toBeLessThan(200); // Average under 200ms even under high load
      console.log(`Stress test completed: ${highLoadRequests} requests in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });

    it('should recover gracefully from resource exhaustion', async () => {
      // Simulate resource exhaustion with many concurrent requests
      const exhaustionRequests = 200;
      
      const monitor = new PerformanceMonitor();
      monitor.start();

      const requests = Array.from({ length: exhaustionRequests }, (_, i) =>
        request(app)
          .get('/api/v1/blogs')
          .query({ page: i % 10 + 1, limit: 5 })
          .timeout(5000) // 5 second timeout
      );

      const responses = await Promise.allSettled(requests);
      
      monitor.end();
      const totalTime = monitor.getExecutionTime();

      const successful = responses.filter(r => r.status === 'fulfilled').length;
      const failed = responses.filter(r => r.status === 'rejected').length;

      // At least 80% should succeed even under extreme load
      expect(successful / exhaustionRequests).toBeGreaterThan(0.8);
      
      console.log(`Resource exhaustion test: ${successful} succeeded, ${failed} failed in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Geographic Distribution Simulation', () => {
    it('should handle requests from different regions efficiently', async () => {
      const regions = ['US', 'EU', 'ASIA', 'AFRICA', 'LATAM'];
      const requestsPerRegion = 10;
      
      const monitor = new PerformanceMonitor();
      monitor.start();

      const allRequests = regions.flatMap(region =>
        Array.from({ length: requestsPerRegion }, () =>
          request(app)
            .get('/api/v1/blogs')
            .set('X-Region', region)
            .query({ page: 1, limit: 10 })
        )
      );

      const responses = await Promise.all(allRequests);
      
      monitor.end();
      const totalTime = monitor.getExecutionTime();

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      const avgResponseTime = totalTime / allRequests.length;
      expect(avgResponseTime).toBeLessThan(150); // Good global performance
      
      console.log(`Global distribution test: ${allRequests.length} requests from ${regions.length} regions in ${totalTime.toFixed(2)}ms (avg: ${avgResponseTime.toFixed(2)}ms)`);
    });
  });
});
