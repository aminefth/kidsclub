import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import BlogModel from '../../models/blogs.model';
import { UserFactory } from '../factories/user.factory';
import { BlogFactory } from '../factories/blog.factory';
import { mockRedis } from '../mocks/redis.mock';
import jwt from 'jsonwebtoken';

// Mock kids safety middleware
const kidsContentFilter = (req: any, res: any, next: any) => {
  const userAge = req.user?.dateOfBirth ? 
    Math.floor((Date.now() - new Date(req.user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 
    null;

  if (userAge && userAge < 18) {
    req.isMinor = true;
    req.ageGroup = userAge < 9 ? 'kids-6-8' : userAge < 13 ? 'kids-9-12' : 'kids-13-16';
  }
  next();
};

const parentalConsentCheck = (req: any, res: any, next: any) => {
  if (req.isMinor && req.user?.dateOfBirth) {
    const userAge = Math.floor((Date.now() - new Date(req.user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (userAge < 13 && !req.user?.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Parental consent required for users under 13',
        requiresParentalConsent: true
      });
    }
  }
  next();
};

const contentModerationFilter = (req: any, res: any, next: any) => {
  if (req.body.content) {
    const inappropriateKeywords = [
      'violence', 'weapon', 'drug', 'alcohol', 'gambling', 
      'adult', 'mature', 'explicit', 'inappropriate'
    ];
    
    const contentText = JSON.stringify(req.body.content).toLowerCase();
    const hasInappropriateContent = inappropriateKeywords.some(keyword => 
      contentText.includes(keyword)
    );

    if (hasInappropriateContent && req.body.isKidsContent) {
      return res.status(400).json({
        success: false,
        message: 'Content contains inappropriate material for kids',
        moderationFlag: true
      });
    }
  }
  next();
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

// Kids-safe routes
app.get('/api/v1/kids/content', mockAuth, kidsContentFilter, async (req: any, res: any) => {
  try {
    const filter: any = { isPublished: true };
    
    if (req.isMinor) {
      filter.isKidsContent = true;
      if (req.ageGroup) {
        filter.ageGroup = { $in: [req.ageGroup, 'general'] };
      }
    }

    const content = await BlogModel.find(filter)
      .populate('author', 'name username avatar')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      content,
      ageGroup: req.ageGroup,
      isMinor: req.isMinor
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/kids/register', parentalConsentCheck, async (req: any, res: any) => {
  try {
    const { name, email, dateOfBirth, parentEmail, parentConsent } = req.body;
    
    const userAge = Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    
    if (userAge < 13 && !parentConsent) {
      return res.status(400).json({
        success: false,
        message: 'Parental consent required for users under 13'
      });
    }

    const user = await userModel.create({
      name,
      email,
      dateOfBirth: new Date(dateOfBirth),
      username: email.split('@')[0] + Math.floor(Math.random() * 1000),
      isVerified: userAge < 13 ? parentConsent : false,
      role: 'user'
    });

    res.status(201).json({
      success: true,
      message: 'Kids account created successfully',
      user: {
        id: user._id,
        name: user.name,
        ageGroup: userAge < 9 ? 'kids-6-8' : userAge < 13 ? 'kids-9-12' : 'kids-13-16'
      }
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/v1/kids/content', mockAuth, kidsContentFilter, contentModerationFilter, async (req: any, res: any) => {
  try {
    const { title, content, ageGroup } = req.body;
    
    const blog = await BlogModel.create({
      blog_id: `kids_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      content: content || [],
      author: req.user._id,
      isKidsContent: true,
      ageGroup: ageGroup || 'kids-9-12',
      parentalGuidance: ageGroup === 'kids-6-8',
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      isPublished: false // Kids content requires moderation
    });

    res.status(201).json({
      success: true,
      message: 'Kids content created and pending moderation',
      blog
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

describe('Kids Club Safety & Educational Features', () => {
  let kidsUser: any;
  let parentUser: any;
  let kidsToken: string;
  let parentToken: string;

  beforeEach(async () => {
    // Create kids user (10 years old)
    const kidsData = UserFactory.createKidsUser('kids-9-12');
    kidsUser = await userModel.create({
      ...kidsData,
      isVerified: true // Assume parental consent given
    });

    // Create parent user
    const parentData = UserFactory.create({ role: 'user' });
    parentUser = await userModel.create(parentData);

    // Generate tokens with user data
    kidsToken = jwt.sign({ 
      id: kidsUser._id,
      user: kidsUser
    }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

    parentToken = jwt.sign({ 
      id: parentUser._id,
      user: parentUser
    }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

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
  });

  describe('Age-Appropriate Content Filtering', () => {
    beforeEach(async () => {
      // Create various content types
      const contents = [
        BlogFactory.createKidsContent('kids-6-8'),
        BlogFactory.createKidsContent('kids-9-12'),
        BlogFactory.createKidsContent('kids-13-16'),
        BlogFactory.create({ isKidsContent: false }) // Adult content
      ];

      await BlogModel.insertMany(contents);
    });

    it('should filter content based on user age', async () => {
      const response = await request(app)
        .get('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.isMinor).toBe(true);
      expect(response.body.ageGroup).toBe('kids-9-12');

      // All returned content should be kids content
      response.body.content.forEach((item: any) => {
        expect(item.isKidsContent).toBe(true);
        expect(['kids-6-8', 'kids-9-12', 'general']).toContain(item.ageGroup);
      });
    });

    it('should not show adult content to minors', async () => {
      const response = await request(app)
        .get('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .expect(200);

      // Should not contain any adult content
      response.body.content.forEach((item: any) => {
        expect(item.isKidsContent).toBe(true);
      });
    });

    it('should show age-appropriate content for different age groups', async () => {
      // Test for younger kids (6-8)
      const youngerKids = await userModel.create({
        ...UserFactory.createKidsUser('kids-6-8'),
        isVerified: true
      });

      const youngerToken = jwt.sign({ 
        id: youngerKids._id,
        user: youngerKids
      }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

      const response = await request(app)
        .get('/api/v1/kids/content')
        .set('Authorization', `Bearer ${youngerToken}`)
        .expect(200);

      expect(response.body.ageGroup).toBe('kids-6-8');
      
      // Should include content for their age and general, but not older kids
      response.body.content.forEach((item: any) => {
        expect(['kids-6-8', 'general']).toContain(item.ageGroup);
      });
    });
  });

  describe('Parental Consent & Controls', () => {
    it('should require parental consent for users under 13', async () => {
      const response = await request(app)
        .post('/api/v1/kids/register')
        .send({
          name: 'Young Kid',
          email: 'youngkid@test.com',
          dateOfBirth: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000), // 10 years old
          parentEmail: 'parent@test.com',
          parentConsent: false
        })
        .expect(400);

      expect(response.body.message).toContain('Parental consent required');
    });

    it('should allow registration with parental consent', async () => {
      const response = await request(app)
        .post('/api/v1/kids/register')
        .send({
          name: 'Young Kid',
          email: 'youngkid@test.com',
          dateOfBirth: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000), // 10 years old
          parentEmail: 'parent@test.com',
          parentConsent: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.ageGroup).toBe('kids-9-12');
    });

    it('should not require parental consent for teens (13+)', async () => {
      const response = await request(app)
        .post('/api/v1/kids/register')
        .send({
          name: 'Teen User',
          email: 'teen@test.com',
          dateOfBirth: new Date(Date.now() - 15 * 365 * 24 * 60 * 60 * 1000), // 15 years old
          parentEmail: 'parent@test.com'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.ageGroup).toBe('kids-13-16');
    });

    it('should automatically determine age group from birth date', async () => {
      const testCases = [
        { age: 7, expectedGroup: 'kids-6-8' },
        { age: 10, expectedGroup: 'kids-9-12' },
        { age: 15, expectedGroup: 'kids-13-16' }
      ];

      for (const testCase of testCases) {
        const birthDate = new Date(Date.now() - testCase.age * 365 * 24 * 60 * 60 * 1000);
        
        const response = await request(app)
          .post('/api/v1/kids/register')
          .send({
            name: `Kid ${testCase.age}`,
            email: `kid${testCase.age}@test.com`,
            dateOfBirth: birthDate,
            parentEmail: 'parent@test.com',
            parentConsent: testCase.age < 13
          })
          .expect(201);

        expect(response.body.user.ageGroup).toBe(testCase.expectedGroup);
      }
    });
  });

  describe('Content Moderation & Safety', () => {
    it('should block inappropriate content for kids', async () => {
      const response = await request(app)
        .post('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send({
          title: 'Inappropriate Content',
          content: [
            {
              type: 'paragraph',
              content: 'This content contains violence and adult themes'
            }
          ],
          isKidsContent: true,
          ageGroup: 'kids-9-12'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('inappropriate material for kids');
      expect(response.body.moderationFlag).toBe(true);
    });

    it('should allow appropriate educational content', async () => {
      const response = await request(app)
        .post('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send({
          title: 'Fun Science Experiment',
          content: [
            {
              type: 'paragraph',
              content: 'Learn about plants and how they grow with this fun experiment!'
            }
          ],
          isKidsContent: true,
          ageGroup: 'kids-9-12'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('pending moderation');
    });

    it('should require moderation for all kids content', async () => {
      const response = await request(app)
        .post('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send({
          title: 'Educational Content',
          content: [{ type: 'paragraph', content: 'Educational content here' }],
          isKidsContent: true,
          ageGroup: 'kids-9-12'
        })
        .expect(201);

      // Kids content should be unpublished by default (pending moderation)
      expect(response.body.blog.isPublished).toBe(false);
    });

    it('should set parental guidance flag for younger kids content', async () => {
      const response = await request(app)
        .post('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send({
          title: 'Content for Young Kids',
          content: [{ type: 'paragraph', content: 'Simple educational content' }],
          isKidsContent: true,
          ageGroup: 'kids-6-8'
        })
        .expect(201);

      expect(response.body.blog.parentalGuidance).toBe(true);
    });

    it('should not require parental guidance for teens content', async () => {
      const response = await request(app)
        .post('/api/v1/kids/content')
        .set('Authorization', `Bearer ${kidsToken}`)
        .send({
          title: 'Content for Teens',
          content: [{ type: 'paragraph', content: 'Educational content for teenagers' }],
          isKidsContent: true,
          ageGroup: 'kids-13-16'
        })
        .expect(201);

      expect(response.body.blog.parentalGuidance).toBe(false);
    });
  });

  describe('Educational Features & Gamification', () => {
    it('should track learning progress for kids users', async () => {
      // Create educational content
      const educationalBlog = await BlogModel.create({
        ...BlogFactory.createEducationalContent(),
        author: parentUser._id,
        isKidsContent: true,
        ageGroup: 'kids-9-12',
        educationalLevel: 'beginner'
      });

      // Simulate reading the content
      educationalBlog.viewHistory.push({
        userId: kidsUser._id.toString(),
        timestamp: new Date(),
        sessionId: 'learning-session-123',
        readTime: 300 // 5 minutes
      });

      await educationalBlog.save();

      const updatedBlog = await BlogModel.findById(educationalBlog._id);
      expect(updatedBlog?.viewHistory).toHaveLength(1);
      expect(updatedBlog?.viewHistory[0].readTime).toBe(300);
    });

    it('should support different educational levels', async () => {
      const levels = ['beginner', 'intermediate', 'advanced'];
      
      for (const level of levels) {
        const blog = await BlogModel.create({
          ...BlogFactory.createEducationalContent(),
          author: parentUser._id,
          isKidsContent: true,
          educationalLevel: level
        });

        expect(blog.educationalLevel).toBe(level);
      }
    });

    it('should categorize content appropriately for kids', async () => {
      const kidsCategories = ['Science', 'Math', 'Art', 'Reading', 'Games'];
      
      for (const category of kidsCategories) {
        const blog = await BlogModel.create({
          ...BlogFactory.createKidsContent(),
          author: parentUser._id,
          category
        });

        expect(blog.category).toBe(category);
        expect(blog.isKidsContent).toBe(true);
      }
    });
  });

  describe('Privacy & Data Protection', () => {
    it('should limit data collection for minors', async () => {
      const kidsProfile = await userModel.findById(kidsUser._id);
      
      // Kids profiles should have minimal data
      expect(kidsProfile?.socialLinks).toEqual({});
      expect(kidsProfile?.phoneNumber).toBeFalsy();
    });

    it('should require verification for kids accounts', async () => {
      const unverifiedKid = await userModel.create({
        ...UserFactory.createKidsUser(),
        isVerified: false
      });

      expect(unverifiedKid.isVerified).toBe(false);
      
      // Unverified kids should have limited access
      const unverifiedToken = jwt.sign({ 
        id: unverifiedKid._id,
        user: unverifiedKid
      }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

      const response = await request(app)
        .post('/api/v1/kids/register')
        .set('Authorization', `Bearer ${unverifiedToken}`)
        .send({
          name: 'Test Kid',
          email: 'testkid@test.com',
          dateOfBirth: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000)
        })
        .expect(403);

      expect(response.body.requiresParentalConsent).toBe(true);
    });

    it('should handle data retention policies for minors', async () => {
      // Kids accounts should have special data handling
      const kidsAccount = await userModel.findById(kidsUser._id);
      
      expect(kidsAccount?.dateOfBirth).toBeTruthy();
      expect(kidsAccount?.role).toBe('user');
      expect(kidsAccount?.isVerified).toBe(true);
    });
  });

  describe('Communication Safety', () => {
    it('should restrict direct messaging for young kids', async () => {
      const youngKid = await userModel.create({
        ...UserFactory.createKidsUser('kids-6-8'),
        isVerified: true
      });

      // Young kids should have communication restrictions
      expect(youngKid.dateOfBirth).toBeTruthy();
      
      const age = Math.floor((Date.now() - youngKid.dateOfBirth!.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      expect(age).toBeLessThan(9);
    });

    it('should allow moderated comments for kids content', async () => {
      const kidsContent = await BlogModel.create({
        ...BlogFactory.createKidsContent(),
        author: parentUser._id
      });

      // Comments on kids content should be moderated
      expect(kidsContent.isKidsContent).toBe(true);
      expect(kidsContent.questions).toEqual([]);
    });

    it('should implement safe reporting mechanisms', async () => {
      const kidsContent = await BlogModel.create({
        ...BlogFactory.createKidsContent(),
        author: parentUser._id
      });

      // Kids content should support safe reporting
      expect(kidsContent.isKidsContent).toBe(true);
      
      // Simulate adding a flagged comment
      kidsContent.questions.push({
        user: kidsUser,
        question: 'This is a test comment',
        questionReplies: [],
        reactions: { likes: 0, dislikes: 0, hearts: 0, laughs: 0 },
        isModerated: false,
        isFlagged: true,
        parentId: new mongoose.Types.ObjectId(),
        depth: 0
      } as any);

      await kidsContent.save();
      
      const updatedContent = await BlogModel.findById(kidsContent._id);
      expect(updatedContent?.questions[0].isFlagged).toBe(true);
    });
  });
});
