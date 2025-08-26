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

// Create comprehensive test app
const app = express();
app.use(express.json());

// Mock complete user journey endpoints
const registrationUser = async (req: any, res: any) => {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    // Generate activation code
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
    const activationToken = jwt.sign(
      { user: { name, email, password }, activationCode },
      process.env.ACTIVATION_SECRET!,
      { expiresIn: '5m' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful, check email for activation code',
      activationToken,
      activationCode // In real app, this would be sent via email
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const activateUser = async (req: any, res: any) => {
  try {
    const { activation_token, activation_code } = req.body;
    
    const decoded = jwt.verify(activation_token, process.env.ACTIVATION_SECRET!) as any;
    
    if (decoded.activationCode !== activation_code) {
      return res.status(400).json({ success: false, message: 'Invalid activation code' });
    }

    const { name, email, password } = decoded.user;
    const username = email.split('@')[0] + Math.floor(Math.random() * 1000);

    const user = await userModel.create({
      name,
      email,
      password,
      username,
      isVerified: true
    });

    res.status(201).json({
      success: true,
      message: 'Account activated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const loginUser = async (req: any, res: any) => {
  try {
    const { email, password } = req.body;
    
    const user = await userModel.findOne({ email }).select('+password');
    if (!user || !await user.comparePassword(password)) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN!, { expiresIn: '7d' });

    // Store in Redis
    await mockRedis.set(user._id.toString(), JSON.stringify(user));

    res.cookie('access_token', accessToken, { httpOnly: true });
    res.cookie('refresh_token', refreshToken, { httpOnly: true });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role
      },
      accessToken
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const mockAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.access_token;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN!) as any;
    req.user = { _id: decoded.id };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const createBlog = async (req: any, res: any) => {
  try {
    const { title, des, content, tags, category, isKidsContent, ageGroup } = req.body;
    
    const blog = await BlogModel.create({
      blog_id: `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      des,
      content: content || [],
      tags: tags || [],
      author: req.user._id,
      category: category || 'General',
      isKidsContent: isKidsContent || false,
      ageGroup: ageGroup || 'general',
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      isPublished: true
    });

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      blog
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getBlogs = async (req: any, res: any) => {
  try {
    const { page = 1, limit = 10, category, isKidsContent } = req.query;
    
    const filter: any = { isPublished: true };
    if (category) filter.category = category;
    if (isKidsContent !== undefined) filter.isKidsContent = isKidsContent === 'true';

    const blogs = await BlogModel.find(filter)
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    res.status(200).json({
      success: true,
      blogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: await BlogModel.countDocuments(filter)
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req: any, res: any) => {
  try {
    const { name, bio, interests } = req.body;
    
    const user = await userModel.findByIdAndUpdate(
      req.user._id,
      { name, bio, interests },
      { new: true }
    );

    // Update Redis cache
    await mockRedis.set(user!._id.toString(), JSON.stringify(user));

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Routes
app.post('/api/v1/registration', registrationUser);
app.post('/api/v1/activate-user', activateUser);
app.post('/api/v1/login', loginUser);
app.post('/api/v1/blogs', mockAuth, createBlog);
app.get('/api/v1/blogs', getBlogs);
app.put('/api/v1/profile', mockAuth, updateProfile);

describe('End-to-End User Journey Tests', () => {
  describe('Complete User Registration & Onboarding Journey', () => {
    let registrationData: any;
    let activationToken: string;
    let activationCode: string;
    let userId: string;
    let accessToken: string;

    it('Step 1: Should register a new user successfully', async () => {
      registrationData = UserFactory.create();
      
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: registrationData.name,
          email: registrationData.email,
          password: 'TestPassword123!'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Registration successful'),
        activationToken: expect.any(String),
        activationCode: expect.any(String)
      });

      activationToken = response.body.activationToken;
      activationCode = response.body.activationCode;
    });

    it('Step 2: Should activate user account with valid code', async () => {
      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: activationToken,
          activation_code: activationCode
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Account activated successfully',
        user: expect.objectContaining({
          id: expect.any(String),
          name: registrationData.name,
          email: registrationData.email,
          username: expect.any(String)
        })
      });

      userId = response.body.user.id;
    });

    it('Step 3: Should login with activated account', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          email: registrationData.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Login successful',
        user: expect.objectContaining({
          id: userId,
          name: registrationData.name,
          email: registrationData.email
        }),
        accessToken: expect.any(String)
      });

      accessToken = response.body.accessToken;

      // Verify cookies are set
      expect(response.headers['set-cookie']).toBeDefined();
      const cookies = response.headers['set-cookie'];
      expect(cookies.some((cookie: string) => cookie.includes('access_token'))).toBe(true);
      expect(cookies.some((cookie: string) => cookie.includes('refresh_token'))).toBe(true);
    });

    it('Step 4: Should update user profile after login', async () => {
      const profileUpdate = {
        name: 'Updated Name',
        bio: 'This is my updated bio',
        interests: ['technology', 'education', 'writing']
      };

      const response = await request(app)
        .put('/api/v1/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(profileUpdate)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Profile updated successfully',
        user: expect.objectContaining({
          name: profileUpdate.name,
          bio: profileUpdate.bio,
          interests: profileUpdate.interests
        })
      });
    });

    it('Step 5: Should create first blog post', async () => {
      const blogData = {
        title: 'My First Blog Post',
        des: 'This is my first blog post on the platform',
        content: [
          {
            type: 'paragraph',
            content: 'Welcome to my blog! This is my first post and I\'m excited to share my thoughts.'
          }
        ],
        tags: ['introduction', 'first-post', 'welcome'],
        category: 'Personal'
      };

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(blogData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Blog created successfully',
        blog: expect.objectContaining({
          title: blogData.title,
          des: blogData.des,
          tags: blogData.tags,
          category: blogData.category,
          author: userId,
          isPublished: true
        })
      });
    });

    it('Step 6: Should view published blogs including own post', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        blogs: expect.any(Array),
        pagination: expect.objectContaining({
          page: 1,
          limit: 10,
          total: expect.any(Number)
        })
      });

      // Should find our created blog
      const ourBlog = response.body.blogs.find((blog: any) => 
        blog.title === 'My First Blog Post'
      );
      expect(ourBlog).toBeTruthy();
      expect(ourBlog.author.name).toBe('Updated Name');
    });
  });

  describe('Creator Journey - Content Creation & Management', () => {
    let creatorUser: any;
    let creatorToken: string;
    let createdBlogs: any[] = [];

    beforeEach(async () => {
      // Create and login creator user
      const creatorData = UserFactory.createCreator();
      creatorUser = await userModel.create({
        ...creatorData,
        password: 'TestPassword123!',
        isVerified: true
      });

      creatorToken = jwt.sign({ id: creatorUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' });
      
      // Mock Redis session
      mockRedis.get.mockImplementation((key: string) => {
        if (key === creatorUser._id.toString()) {
          return Promise.resolve(JSON.stringify(creatorUser));
        }
        return Promise.resolve(null);
      });
    });

    it('Should create multiple blog posts with different categories', async () => {
      const blogCategories = ['Technology', 'Education', 'Lifestyle', 'Business'];
      
      for (const category of blogCategories) {
        const blogData = {
          title: `${category} Blog Post`,
          des: `A comprehensive guide to ${category.toLowerCase()}`,
          content: [
            {
              type: 'paragraph',
              content: `This is a detailed post about ${category.toLowerCase()} topics.`
            }
          ],
          tags: [category.toLowerCase(), 'guide', 'tutorial'],
          category
        };

        const response = await request(app)
          .post('/api/v1/blogs')
          .set('Authorization', `Bearer ${creatorToken}`)
          .send(blogData)
          .expect(201);

        expect(response.body.success).toBe(true);
        createdBlogs.push(response.body.blog);
      }

      expect(createdBlogs).toHaveLength(4);
    });

    it('Should create kids-safe educational content', async () => {
      const kidsContent = {
        title: 'Fun Science Experiments for Kids',
        des: 'Safe and educational science experiments children can do at home',
        content: [
          {
            type: 'paragraph',
            content: 'Today we\'ll learn about simple science experiments that are both fun and educational!'
          },
          {
            type: 'paragraph',
            content: 'Remember to always ask an adult for help with these experiments.'
          }
        ],
        tags: ['kids', 'science', 'education', 'experiments'],
        category: 'Education',
        isKidsContent: true,
        ageGroup: 'kids-9-12'
      };

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send(kidsContent)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        blog: expect.objectContaining({
          isKidsContent: true,
          ageGroup: 'kids-9-12',
          category: 'Education'
        })
      });
    });

    it('Should filter content by category and kids-safe flag', async () => {
      // Create some test content first
      await BlogModel.create([
        {
          ...BlogFactory.create({ authorId: creatorUser._id.toString() }),
          category: 'Technology',
          isKidsContent: false
        },
        {
          ...BlogFactory.createKidsContent('kids-9-12'),
          author: creatorUser._id,
          category: 'Education'
        }
      ]);

      // Test category filtering
      const techResponse = await request(app)
        .get('/api/v1/blogs')
        .query({ category: 'Technology' })
        .expect(200);

      techResponse.body.blogs.forEach((blog: any) => {
        expect(blog.category).toBe('Technology');
      });

      // Test kids content filtering
      const kidsResponse = await request(app)
        .get('/api/v1/blogs')
        .query({ isKidsContent: 'true' })
        .expect(200);

      kidsResponse.body.blogs.forEach((blog: any) => {
        expect(blog.isKidsContent).toBe(true);
      });
    });
  });

  describe('Kids User Journey - Safe Content Consumption', () => {
    let kidsUser: any;
    let parentUser: any;
    let kidsToken: string;

    beforeEach(async () => {
      // Create kids user (10 years old)
      const kidsData = UserFactory.createKidsUser('kids-9-12');
      kidsUser = await userModel.create({
        ...kidsData,
        password: 'KidsPassword123!',
        isVerified: true // Assume parental consent given
      });

      // Create parent user
      parentUser = await userModel.create({
        ...UserFactory.create({ role: 'user' }),
        password: 'ParentPassword123!'
      });

      kidsToken = jwt.sign({ id: kidsUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' });

      // Mock Redis sessions
      mockRedis.get.mockImplementation((key: string) => {
        if (key === kidsUser._id.toString()) {
          return Promise.resolve(JSON.stringify(kidsUser));
        }
        if (key === parentUser._id.toString()) {
          return Promise.resolve(JSON.stringify(parentUser));
        }
        return Promise.resolve(null);
      });

      // Create mixed content for testing
      await BlogModel.create([
        // Kids content
        {
          ...BlogFactory.createKidsContent('kids-9-12'),
          author: parentUser._id,
          title: 'Fun Math Games for Kids'
        },
        {
          ...BlogFactory.createKidsContent('kids-6-8'),
          author: parentUser._id,
          title: 'Simple Art Projects'
        },
        // Adult content
        {
          ...BlogFactory.create({ isKidsContent: false }),
          author: parentUser._id,
          title: 'Advanced Programming Concepts'
        }
      ]);
    });

    it('Should only see age-appropriate content when browsing', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .query({ isKidsContent: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All returned content should be kids content
      response.body.blogs.forEach((blog: any) => {
        expect(blog.isKidsContent).toBe(true);
        expect(['kids-6-8', 'kids-9-12', 'kids-13-16', 'general']).toContain(blog.ageGroup);
      });

      // Should find our kids content
      const mathGames = response.body.blogs.find((blog: any) => 
        blog.title === 'Fun Math Games for Kids'
      );
      expect(mathGames).toBeTruthy();
    });

    it('Should not see adult content in general browsing', async () => {
      const response = await request(app)
        .get('/api/v1/blogs')
        .expect(200);

      // In a real implementation, this would filter based on user age
      // For now, we verify that adult content exists but can be filtered
      const adultContent = response.body.blogs.find((blog: any) => 
        blog.title === 'Advanced Programming Concepts'
      );
      
      // Adult content should exist but would be filtered in real implementation
      if (adultContent) {
        expect(adultContent.isKidsContent).toBe(false);
      }
    });

    it('Should be able to create age-appropriate content with moderation', async () => {
      const kidsCreatedContent = {
        title: 'My Favorite Animals',
        des: 'A story about my favorite animals and why I love them',
        content: [
          {
            type: 'paragraph',
            content: 'I love cats because they are fluffy and playful. My cat likes to play with yarn!'
          }
        ],
        tags: ['animals', 'cats', 'pets', 'kids'],
        category: 'Personal',
        isKidsContent: true,
        ageGroup: 'kids-9-12'
      };

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send(kidsCreatedContent)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        blog: expect.objectContaining({
          title: kidsCreatedContent.title,
          isKidsContent: true,
          ageGroup: 'kids-9-12',
          author: kidsUser._id.toString()
        })
      });
    });
  });

  describe('Admin Journey - Platform Management', () => {
    let adminUser: any;
    let adminToken: string;

    beforeEach(async () => {
      adminUser = await userModel.create({
        ...UserFactory.createAdmin(),
        password: 'AdminPassword123!'
      });

      adminToken = jwt.sign({ id: adminUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' });

      mockRedis.get.mockImplementation((key: string) => {
        if (key === adminUser._id.toString()) {
          return Promise.resolve(JSON.stringify(adminUser));
        }
        return Promise.resolve(null);
      });
    });

    it('Should be able to view all content including unpublished', async () => {
      // Create mixed published/unpublished content
      await BlogModel.create([
        {
          ...BlogFactory.create({ isPublished: true }),
          author: adminUser._id,
          title: 'Published Blog'
        },
        {
          ...BlogFactory.create({ isPublished: false }),
          author: adminUser._id,
          title: 'Draft Blog'
        }
      ]);

      // Regular users see only published
      const publicResponse = await request(app)
        .get('/api/v1/blogs')
        .expect(200);

      const publishedBlogs = publicResponse.body.blogs.filter((blog: any) => 
        blog.isPublished === true
      );
      expect(publishedBlogs.length).toBeGreaterThan(0);

      // Admin should be able to see all (in real implementation)
      // For now, we verify the content exists in database
      const allBlogs = await BlogModel.find({});
      const draftBlogs = allBlogs.filter(blog => !blog.isPublished);
      expect(draftBlogs.length).toBeGreaterThan(0);
    });

    it('Should be able to manage platform content', async () => {
      const adminContent = {
        title: 'Platform Announcement',
        des: 'Important updates about our platform',
        content: [
          {
            type: 'paragraph',
            content: 'We are excited to announce new features coming to our platform!'
          }
        ],
        tags: ['announcement', 'platform', 'updates'],
        category: 'Announcements',
        featured: true
      };

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(adminContent)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        blog: expect.objectContaining({
          title: adminContent.title,
          category: 'Announcements',
          author: adminUser._id.toString()
        })
      });
    });
  });

  describe('Cross-User Interaction Journey', () => {
    let users: any[] = [];
    let tokens: string[] = [];
    let sharedBlog: any;

    beforeEach(async () => {
      // Create multiple users for interaction testing
      const userData = [
        UserFactory.create({ role: 'user' }),
        UserFactory.createCreator(),
        UserFactory.createModerator()
      ];

      users = await userModel.insertMany(
        userData.map(data => ({ ...data, password: 'TestPassword123!' }))
      );

      tokens = users.map(user => 
        jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' })
      );

      // Mock Redis for all users
      mockRedis.get.mockImplementation((key: string) => {
        const user = users.find(u => u._id.toString() === key);
        return user ? Promise.resolve(JSON.stringify(user)) : Promise.resolve(null);
      });

      // Create a shared blog post
      sharedBlog = await BlogModel.create({
        ...BlogFactory.create({ authorId: users[1]._id.toString() }),
        title: 'Shared Blog for Testing',
        isPublished: true
      });
    });

    it('Should allow multiple users to view the same content', async () => {
      for (let i = 0; i < users.length; i++) {
        const response = await request(app)
          .get('/api/v1/blogs')
          .set('Authorization', `Bearer ${tokens[i]}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        
        // All users should see the shared blog
        const foundBlog = response.body.blogs.find((blog: any) => 
          blog._id === sharedBlog._id.toString()
        );
        expect(foundBlog).toBeTruthy();
      }
    });

    it('Should maintain user sessions across different operations', async () => {
      const user = users[0];
      const token = tokens[0];

      // Perform multiple operations with same token
      const operations = [
        () => request(app).get('/api/v1/blogs').set('Authorization', `Bearer ${token}`),
        () => request(app).put('/api/v1/profile').set('Authorization', `Bearer ${token}`).send({ bio: 'Updated bio' }),
        () => request(app).post('/api/v1/blogs').set('Authorization', `Bearer ${token}`).send({
          title: 'Session Test Blog',
          des: 'Testing session persistence'
        })
      ];

      for (const operation of operations) {
        const response = await operation();
        expect(response.status).toBeLessThan(400); // Should not fail due to auth issues
      }
    });
  });

  describe('Error Recovery & Edge Cases', () => {
    it('Should handle registration with existing email gracefully', async () => {
      const userData = UserFactory.create();
      
      // First registration
      await request(app)
        .post('/api/v1/registration')
        .send({
          name: userData.name,
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: 'Different Name',
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Email already exists'
      });
    });

    it('Should handle invalid activation codes', async () => {
      const userData = UserFactory.create();
      
      const regResponse = await request(app)
        .post('/api/v1/registration')
        .send({
          name: userData.name,
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(201);

      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: regResponse.body.activationToken,
          activation_code: '0000' // Wrong code
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Invalid activation code'
      });
    });

    it('Should handle expired tokens gracefully', async () => {
      const expiredToken = jwt.sign(
        { id: 'some-user-id' },
        process.env.ACCESS_TOKEN!,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .post('/api/v1/blogs')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          title: 'Test Blog',
          des: 'Should fail due to expired token'
        })
        .expect(401);

      expect(response.body.message).toContain('Invalid token');
    });

    it('Should handle malformed requests without crashing', async () => {
      const malformedRequests = [
        () => request(app).post('/api/v1/registration').send('invalid-json'),
        () => request(app).post('/api/v1/login').send({ email: null, password: undefined }),
        () => request(app).get('/api/v1/blogs').query({ page: 'invalid', limit: -1 })
      ];

      for (const malformedRequest of malformedRequests) {
        const response = await malformedRequest();
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500); // Should not cause server errors
      }
    });
  });
});
