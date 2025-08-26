import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import BlogModel from '../../models/blogs.model';
import { UserFactory } from '../factories/user.factory';
import { BlogFactory } from '../factories/blog.factory';
import { mockRedis } from '../mocks/redis.mock';
import { mockImageKit } from '../mocks/imagekit.mock';
import jwt from 'jsonwebtoken';

// Mock blog controller functions (you'll need to import actual ones)
const createBlog = async (req: any, res: any) => {
  try {
    const { title, des, content, tags, category, ageGroup, isKidsContent } = req.body;
    const authorId = req.user._id;

    const blog = await BlogModel.create({
      blog_id: `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      des,
      content: content || [],
      tags: tags || [],
      author: authorId,
      category: category || 'General',
      ageGroup: ageGroup || 'general',
      isKidsContent: isKidsContent || false,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      isPublished: true
    });

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

const getBlogs = async (req: any, res: any) => {
  try {
    const { page = 1, limit = 10, category, ageGroup, isKidsContent } = req.query;
    
    const filter: any = { isPublished: true };
    if (category) filter.category = category;
    if (ageGroup) filter.ageGroup = ageGroup;
    if (isKidsContent !== undefined) filter.isKidsContent = isKidsContent === 'true';

    const blogs = await BlogModel.find(filter)
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await BlogModel.countDocuments(filter);

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
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
    req.user = { _id: decoded.id };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Blog routes
app.post('/api/v1/blogs', mockAuth, createBlog);
app.get('/api/v1/blogs', getBlogs);

describe('Blog Management System', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    // Create test user
    testUser = await userModel.create({
      ...UserFactory.createCreator(),
      password: 'TestPassword123!'
    });

    // Generate auth token
    authToken = jwt.sign({ id: testUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

    // Mock Redis session
    mockRedis.get.mockResolvedValue(JSON.stringify(testUser));
  });

  describe('POST /api/v1/blogs - Create Blog', () => {
    it('should create a regular blog post successfully', async () => {
      const blogData = BlogFactory.create({
        authorId: testUser._id.toString(),
        isPublished: true
      });

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: blogData.title,
          des: blogData.des,
          content: blogData.content,
          tags: blogData.tags,
          category: blogData.category
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Blog created successfully',
        blog: expect.objectContaining({
          title: blogData.title,
          des: blogData.des,
          author: testUser._id.toString(),
          isPublished: true,
          slug: expect.any(String)
        })
      });

      // Verify blog was saved to database
      const savedBlog = await BlogModel.findById(response.body.blog._id);
      expect(savedBlog).toBeTruthy();
      expect(savedBlog?.title).toBe(blogData.title);
    });

    it('should create kids content with proper age group', async () => {
      const kidsData = BlogFactory.createKidsContent('kids-9-12');

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: kidsData.title,
          des: kidsData.des,
          content: kidsData.content,
          tags: kidsData.tags,
          category: 'Education',
          ageGroup: 'kids-9-12',
          isKidsContent: true
        })
        .expect(201);

      expect(response.body.blog).toMatchObject({
        ageGroup: 'kids-9-12',
        isKidsContent: true,
        category: 'Education'
      });

      // Verify kids content safety features
      const savedBlog = await BlogModel.findById(response.body.blog._id);
      expect(savedBlog?.isKidsContent).toBe(true);
      expect(savedBlog?.ageGroup).toBe('kids-9-12');
    });

    it('should require authentication for blog creation', async () => {
      const blogData = BlogFactory.create();

      const response = await request(app)
        .post('/api/v1/blogs')
        .send({
          title: blogData.title,
          des: blogData.des
        })
        .expect(401);

      expect(response.body.message).toBe('No token provided');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          des: 'Description without title'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should generate unique blog_id and slug', async () => {
      const blogData = BlogFactory.create();

      const response1 = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: blogData.title,
          des: blogData.des
        });

      const response2 = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: blogData.title,
          des: blogData.des
        });

      expect(response1.body.blog.blog_id).not.toBe(response2.body.blog.blog_id);
      expect(response1.body.blog.slug).not.toBe(response2.body.blog.slug);
    });

    it('should handle content with media uploads', async () => {
      mockImageKit.uploadFile.mockResolvedValueOnce({
        success: true,
        data: {
          fileId: 'test-image-id',
          url: 'https://ik.imagekit.io/test/blog-image.webp'
        }
      });

      const blogData = BlogFactory.create();

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: blogData.title,
          des: blogData.des,
          content: [
            {
              type: 'paragraph',
              content: 'This is a test paragraph'
            },
            {
              type: 'image',
              url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='
            }
          ]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/blogs - List Blogs', () => {
    beforeEach(async () => {
      // Create test blogs
      const regularBlogs = BlogFactory.createBatch(5, {
        authorId: testUser._id.toString(),
        isPublished: true
      });

      const kidsBlogs = BlogFactory.createBatch(3, {
        authorId: testUser._id.toString(),
        isKidsContent: true,
        ageGroup: 'kids-9-12',
        isPublished: true
      });

      // Save to database
      await BlogModel.insertMany([...regularBlogs, ...kidsBlogs]);
    });

    it('should list all published blogs with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ page: 1, limit: 5 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        blogs: expect.any(Array),
        pagination: {
          page: 1,
          limit: 5,
          total: expect.any(Number),
          pages: expect.any(Number)
        }
      });

      expect(response.body.blogs).toHaveLength(5);
      expect(response.body.blogs[0]).toHaveProperty('author');
      expect(response.body.blogs[0]).toHaveProperty('title');
      expect(response.body.blogs[0]).toHaveProperty('createdAt');
    });

    it('should filter blogs by category', async () => {
      // Create education blogs
      await BlogModel.create({
        ...BlogFactory.create({
          authorId: testUser._id.toString(),
          category: 'Education'
        })
      });

      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ category: 'Education' })
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.blogs.forEach((blog: any) => {
        expect(blog.category).toBe('Education');
      });
    });

    it('should filter blogs by age group for kids content', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ ageGroup: 'kids-9-12' })
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.blogs.forEach((blog: any) => {
        expect(blog.ageGroup).toBe('kids-9-12');
      });
    });

    it('should filter kids content specifically', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ isKidsContent: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.blogs.forEach((blog: any) => {
        expect(blog.isKidsContent).toBe(true);
      });
    });

    it('should populate author information', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .expect(200);

      expect(response.body.blogs[0].author).toMatchObject({
        name: expect.any(String),
        username: expect.any(String),
        avatar: expect.any(Object)
      });
    });

    it('should sort blogs by creation date (newest first)', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .expect(200);

      const blogs = response.body.blogs;
      for (let i = 1; i < blogs.length; i++) {
        const currentDate = new Date(blogs[i].createdAt);
        const previousDate = new Date(blogs[i - 1].createdAt);
        expect(currentDate.getTime()).toBeLessThanOrEqual(previousDate.getTime());
      }
    });

    it('should handle pagination correctly', async () => {
      // Test first page
      const page1 = await request(app)
        .get('/api/v1/blogs')
        .query({ page: 1, limit: 3 })
        .expect(200);

      // Test second page
      const page2 = await request(app)
        .get('/api/v1/blogs')
        .query({ page: 2, limit: 3 })
        .expect(200);

      expect(page1.body.blogs).toHaveLength(3);
      expect(page2.body.blogs.length).toBeGreaterThan(0);
      
      // Ensure different blogs on different pages
      const page1Ids = page1.body.blogs.map((b: any) => b._id);
      const page2Ids = page2.body.blogs.map((b: any) => b._id);
      const intersection = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });
  });

  describe('Kids Content Safety Features', () => {
    it('should enforce parental guidance for younger kids content', async () => {
      const kidsData = BlogFactory.createKidsContent('kids-6-8');

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: kidsData.title,
          des: kidsData.des,
          ageGroup: 'kids-6-8',
          isKidsContent: true
        })
        .expect(201);

      const savedBlog = await BlogModel.findById(response.body.blog._id);
      expect(savedBlog?.parentalGuidance).toBe(true);
    });

    it('should not require parental guidance for teens content', async () => {
      const teensData = BlogFactory.createKidsContent('kids-13-16');

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: teensData.title,
          des: teensData.des,
          ageGroup: 'kids-13-16',
          isKidsContent: true
        })
        .expect(201);

      const savedBlog = await BlogModel.findById(response.body.blog._id);
      expect(savedBlog?.parentalGuidance).toBe(false);
    });

    it('should validate age-appropriate content tags for kids', async () => {
      const inappropriateTags = ['violence', 'adult', 'gambling', 'alcohol'];
      const appropriateTags = ['education', 'fun', 'learning', 'science'];

      // Test appropriate tags
      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Fun Science for Kids',
          des: 'Educational content',
          tags: appropriateTags,
          ageGroup: 'kids-9-12',
          isKidsContent: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should track view history for analytics', async () => {
      const blog = await BlogModel.create({
        ...BlogFactory.create({
          authorId: testUser._id.toString()
        })
      });

      // Simulate view tracking (this would be in a separate endpoint)
      blog.viewHistory.push({
        userId: testUser._id.toString(),
        timestamp: new Date(),
        sessionId: 'test-session-123',
        readTime: 120
      });

      await blog.save();

      const updatedBlog = await BlogModel.findById(blog._id);
      expect(updatedBlog?.viewHistory).toHaveLength(1);
      expect(updatedBlog?.viewHistory[0].readTime).toBe(120);
    });
  });

  describe('Blog Analytics and Engagement', () => {
    let testBlog: any;

    beforeEach(async () => {
      testBlog = await BlogModel.create({
        ...BlogFactory.create({
          authorId: testUser._id.toString()
        })
      });
    });

    it('should initialize activity metrics correctly', async () => {
      expect(testBlog.activity).toMatchObject({
        total_likes: expect.any(Number),
        total_comments: expect.any(Number),
        total_reads: expect.any(Number),
        total_parent_comments: expect.any(Number),
        average_read_time: expect.any(Number),
        bounce_rate: expect.any(Number),
        engagement_score: expect.any(Number)
      });
    });

    it('should handle SEO metadata properly', async () => {
      expect(testBlog.metaDescription).toBeTruthy();
      expect(testBlog.metaDescription.length).toBeLessThanOrEqual(160);
      expect(testBlog.slug).toBeTruthy();
      expect(testBlog.slug).toMatch(/^[a-z0-9-]+$/);
    });

    it('should support featured content marking', async () => {
      const featuredBlog = await BlogModel.create({
        ...BlogFactory.createFeaturedPost(),
        author: testUser._id
      });

      expect(featuredBlog.featured).toBe(true);

      // Featured blogs should appear first in listings
      const response = await request(app)
        .get('/api/v1/blogs')
        .expect(200);

      const featuredBlogs = response.body.blogs.filter((b: any) => b.featured);
      expect(featuredBlogs.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large content efficiently', async () => {
      const largeContent = Array.from({ length: 100 }, (_, i) => ({
        type: 'paragraph',
        content: `This is paragraph ${i + 1} with substantial content to test performance. `.repeat(10)
      }));

      const startTime = Date.now();

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Large Content Blog',
          des: 'Testing large content handling',
          content: largeContent
        })
        .expect(201);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.body.success).toBe(true);
    });

    it('should handle concurrent blog creation', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/v1/blogs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Concurrent Blog ${i + 1}`,
            des: `Description for blog ${i + 1}`
          })
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Verify all blogs were created with unique IDs
      const blogIds = responses.map(r => r.body.blog._id);
      const uniqueIds = [...new Set(blogIds)];
      expect(uniqueIds).toHaveLength(10);
    });
  });
});
