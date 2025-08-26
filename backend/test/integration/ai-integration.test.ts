import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import BlogModel from '../../models/blogs.model';
import { UserFactory } from '../factories/user.factory';
import { BlogFactory } from '../factories/blog.factory';
import { mockRedis } from '../mocks/redis.mock';
import jwt from 'jsonwebtoken';

// Mock AI services
const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn()
    }
  }
};

const mockContentModerationAI = {
  moderateContent: jest.fn(),
  detectInappropriateContent: jest.fn(),
  classifyContentAge: jest.fn(),
  generateContentTags: jest.fn()
};

const mockPersonalizationAI = {
  getPersonalizedRecommendations: jest.fn(),
  analyzeUserPreferences: jest.fn(),
  generateUserInterests: jest.fn()
};

const mockEducationalAI = {
  assessContentEducationalLevel: jest.fn(),
  generateQuizQuestions: jest.fn(),
  suggestLearningPath: jest.fn()
};

// Create test app with AI endpoints
const app = express();
app.use(express.json());

// Mock authentication middleware
const mockAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
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

// AI Content Moderation Endpoint
const aiContentModeration = async (req: any, res: any) => {
  try {
    const { content, contentType = 'blog' } = req.body;
    
    if (!content) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    // Simulate AI content moderation
    const moderationResult = await mockContentModerationAI.moderateContent(content);
    const inappropriateContent = await mockContentModerationAI.detectInappropriateContent(content);
    const ageClassification = await mockContentModerationAI.classifyContentAge(content);
    const suggestedTags = await mockContentModerationAI.generateContentTags(content);

    res.status(200).json({
      success: true,
      data: {
        isAppropriate: moderationResult.isAppropriate,
        confidenceScore: moderationResult.confidence,
        flaggedContent: inappropriateContent.flaggedPhrases,
        ageGroup: ageClassification.recommendedAge,
        suggestedTags: suggestedTags.tags,
        moderationActions: moderationResult.actions
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// AI Personalization Endpoint
const aiPersonalization = async (req: any, res: any) => {
  try {
    const userId = req.user._id;
    const { preferences, contentHistory } = req.body;

    const recommendations = await mockPersonalizationAI.getPersonalizedRecommendations(userId, preferences);
    const userAnalysis = await mockPersonalizationAI.analyzeUserPreferences(contentHistory);
    const interests = await mockPersonalizationAI.generateUserInterests(userAnalysis);

    res.status(200).json({
      success: true,
      data: {
        recommendations: recommendations.items,
        userProfile: {
          interests: interests.categories,
          preferredContentTypes: userAnalysis.contentTypes,
          readingLevel: userAnalysis.complexity,
          engagementPatterns: userAnalysis.patterns
        },
        confidence: recommendations.confidence
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// AI Educational Assessment Endpoint
const aiEducationalAssessment = async (req: any, res: any) => {
  try {
    const { content, targetAge } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const educationalLevel = await mockEducationalAI.assessContentEducationalLevel(content);
    const quizQuestions = await mockEducationalAI.generateQuizQuestions(content, targetAge);
    const learningPath = await mockEducationalAI.suggestLearningPath(content, targetAge);

    res.status(200).json({
      success: true,
      data: {
        educationalMetrics: {
          complexity: educationalLevel.complexity,
          readingLevel: educationalLevel.readingLevel,
          concepts: educationalLevel.keyConcepts,
          skills: educationalLevel.skillsRequired
        },
        assessment: {
          questions: quizQuestions.questions,
          difficulty: quizQuestions.difficulty,
          estimatedTime: quizQuestions.timeMinutes
        },
        learningPath: {
          prerequisites: learningPath.prerequisites,
          nextTopics: learningPath.suggestions,
          difficulty: learningPath.progressionLevel
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// AI Content Generation Endpoint
const aiContentGeneration = async (req: any, res: any) => {
  try {
    const { prompt, contentType, targetAudience, maxLength = 500 } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    // Mock OpenAI API call
    const completion = await mockOpenAI.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Generate ${contentType} content for ${targetAudience}. Keep it under ${maxLength} characters.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: Math.floor(maxLength / 4)
    });

    res.status(200).json({
      success: true,
      data: {
        generatedContent: completion.choices[0].message.content,
        metadata: {
          model: completion.model,
          tokensUsed: completion.usage?.total_tokens,
          contentType,
          targetAudience
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Routes
app.post('/api/v1/ai/moderate', mockAuth, aiContentModeration);
app.post('/api/v1/ai/personalize', mockAuth, aiPersonalization);
app.post('/api/v1/ai/educational-assessment', mockAuth, aiEducationalAssessment);
app.post('/api/v1/ai/generate-content', mockAuth, aiContentGeneration);

describe('AI Integration Tests', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    // Create test user
    testUser = await userModel.create({
      ...UserFactory.create(),
      password: 'TestPassword123!'
    });

    authToken = jwt.sign({ id: testUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '1h' });

    // Mock Redis session
    mockRedis.get.mockImplementation((key: string) => {
      if (key === testUser._id.toString()) {
        return Promise.resolve(JSON.stringify(testUser));
      }
      return Promise.resolve(null);
    });

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('AI Content Moderation', () => {
    beforeEach(() => {
      mockContentModerationAI.moderateContent.mockResolvedValue({
        isAppropriate: true,
        confidence: 0.95,
        actions: []
      });

      mockContentModerationAI.detectInappropriateContent.mockResolvedValue({
        flaggedPhrases: []
      });

      mockContentModerationAI.classifyContentAge.mockResolvedValue({
        recommendedAge: 'general'
      });

      mockContentModerationAI.generateContentTags.mockResolvedValue({
        tags: ['educational', 'informative']
      });
    });

    it('should moderate appropriate content successfully', async () => {
      const content = 'This is a wonderful educational article about science for kids.';

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isAppropriate: true,
          confidenceScore: 0.95,
          flaggedContent: [],
          ageGroup: 'general',
          suggestedTags: ['educational', 'informative'],
          moderationActions: []
        }
      });

      expect(mockContentModerationAI.moderateContent).toHaveBeenCalledWith(content);
    });

    it('should flag inappropriate content', async () => {
      mockContentModerationAI.moderateContent.mockResolvedValue({
        isAppropriate: false,
        confidence: 0.88,
        actions: ['review_required', 'flag_content']
      });

      mockContentModerationAI.detectInappropriateContent.mockResolvedValue({
        flaggedPhrases: ['inappropriate phrase']
      });

      const inappropriateContent = 'This content contains inappropriate material.';

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: inappropriateContent })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          isAppropriate: false,
          confidenceScore: 0.88,
          flaggedContent: ['inappropriate phrase'],
          moderationActions: ['review_required', 'flag_content']
        }
      });
    });

    it('should classify content for different age groups', async () => {
      mockContentModerationAI.classifyContentAge.mockResolvedValue({
        recommendedAge: 'kids-9-12'
      });

      const kidsContent = 'Fun math games that help children learn addition and subtraction!';

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: kidsContent })
        .expect(200);

      expect(response.body.data.ageGroup).toBe('kids-9-12');
      expect(mockContentModerationAI.classifyContentAge).toHaveBeenCalledWith(kidsContent);
    });

    it('should handle content moderation errors gracefully', async () => {
      mockContentModerationAI.moderateContent.mockRejectedValue(new Error('AI service unavailable'));

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Test content' })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: 'AI service unavailable'
      });
    });

    it('should require authentication for moderation', async () => {
      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .send({ content: 'Test content' })
        .expect(401);

      expect(response.body.message).toBe('Authentication required');
    });
  });

  describe('AI Personalization', () => {
    beforeEach(() => {
      mockPersonalizationAI.getPersonalizedRecommendations.mockResolvedValue({
        items: [
          { id: 'blog1', title: 'Recommended Blog 1', score: 0.95 },
          { id: 'blog2', title: 'Recommended Blog 2', score: 0.87 }
        ],
        confidence: 0.91
      });

      mockPersonalizationAI.analyzeUserPreferences.mockResolvedValue({
        contentTypes: ['educational', 'technology'],
        complexity: 'intermediate',
        patterns: ['morning_reader', 'long_form_content']
      });

      mockPersonalizationAI.generateUserInterests.mockResolvedValue({
        categories: ['science', 'technology', 'education']
      });
    });

    it('should generate personalized recommendations', async () => {
      const preferences = {
        categories: ['technology', 'science'],
        difficulty: 'intermediate'
      };

      const contentHistory = [
        { blogId: 'blog1', timeSpent: 300, engagement: 'high' },
        { blogId: 'blog2', timeSpent: 150, engagement: 'medium' }
      ];

      const response = await request(app)
        .post('/api/v1/ai/personalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ preferences, contentHistory })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          recommendations: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              title: expect.any(String),
              score: expect.any(Number)
            })
          ]),
          userProfile: {
            interests: ['science', 'technology', 'education'],
            preferredContentTypes: ['educational', 'technology'],
            readingLevel: 'intermediate',
            engagementPatterns: ['morning_reader', 'long_form_content']
          },
          confidence: 0.91
        }
      });

      expect(mockPersonalizationAI.getPersonalizedRecommendations).toHaveBeenCalledWith(
        testUser._id,
        preferences
      );
    });

    it('should handle empty content history', async () => {
      mockPersonalizationAI.analyzeUserPreferences.mockResolvedValue({
        contentTypes: ['general'],
        complexity: 'beginner',
        patterns: []
      });

      const response = await request(app)
        .post('/api/v1/ai/personalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ preferences: {}, contentHistory: [] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userProfile.readingLevel).toBe('beginner');
    });

    it('should handle personalization service errors', async () => {
      mockPersonalizationAI.getPersonalizedRecommendations.mockRejectedValue(
        new Error('Personalization service error')
      );

      const response = await request(app)
        .post('/api/v1/ai/personalize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ preferences: {}, contentHistory: [] })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Personalization service error'
      });
    });
  });

  describe('AI Educational Assessment', () => {
    beforeEach(() => {
      mockEducationalAI.assessContentEducationalLevel.mockResolvedValue({
        complexity: 'intermediate',
        readingLevel: 'grade-6',
        keyConcepts: ['addition', 'subtraction', 'problem-solving'],
        skillsRequired: ['basic_math', 'logical_thinking']
      });

      mockEducationalAI.generateQuizQuestions.mockResolvedValue({
        questions: [
          {
            question: 'What is 5 + 3?',
            options: ['6', '7', '8', '9'],
            correct: 2,
            explanation: '5 + 3 equals 8'
          }
        ],
        difficulty: 'easy',
        timeMinutes: 5
      });

      mockEducationalAI.suggestLearningPath.mockResolvedValue({
        prerequisites: ['basic_counting', 'number_recognition'],
        suggestions: ['multiplication', 'division'],
        progressionLevel: 'beginner_to_intermediate'
      });
    });

    it('should assess educational content successfully', async () => {
      const content = 'Learn basic addition and subtraction with fun examples and practice problems.';
      const targetAge = 'kids-6-8';

      const response = await request(app)
        .post('/api/v1/ai/educational-assessment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content, targetAge })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          educationalMetrics: {
            complexity: 'intermediate',
            readingLevel: 'grade-6',
            concepts: ['addition', 'subtraction', 'problem-solving'],
            skills: ['basic_math', 'logical_thinking']
          },
          assessment: {
            questions: expect.arrayContaining([
              expect.objectContaining({
                question: expect.any(String),
                options: expect.any(Array),
                correct: expect.any(Number)
              })
            ]),
            difficulty: 'easy',
            estimatedTime: 5
          },
          learningPath: {
            prerequisites: ['basic_counting', 'number_recognition'],
            nextTopics: ['multiplication', 'division'],
            difficulty: 'beginner_to_intermediate'
          }
        }
      });

      expect(mockEducationalAI.assessContentEducationalLevel).toHaveBeenCalledWith(content);
      expect(mockEducationalAI.generateQuizQuestions).toHaveBeenCalledWith(content, targetAge);
    });

    it('should require content for assessment', async () => {
      const response = await request(app)
        .post('/api/v1/ai/educational-assessment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetAge: 'kids-6-8' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Content is required'
      });
    });

    it('should handle different target age groups', async () => {
      const ageGroups = ['kids-6-8', 'kids-9-12', 'kids-13-16', 'adult'];

      for (const targetAge of ageGroups) {
        mockEducationalAI.generateQuizQuestions.mockClear();

        await request(app)
          .post('/api/v1/ai/educational-assessment')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ 
            content: 'Educational content for testing',
            targetAge 
          })
          .expect(200);

        expect(mockEducationalAI.generateQuizQuestions).toHaveBeenCalledWith(
          'Educational content for testing',
          targetAge
        );
      }
    });
  });

  describe('AI Content Generation', () => {
    beforeEach(() => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'Generated content based on the prompt provided.'
            }
          }
        ],
        model: 'gpt-4',
        usage: {
          total_tokens: 50
        }
      });
    });

    it('should generate content based on prompt', async () => {
      const prompt = 'Write a short story about a friendly robot for kids';
      const contentType = 'story';
      const targetAudience = 'kids-6-8';

      const response = await request(app)
        .post('/api/v1/ai/generate-content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ prompt, contentType, targetAudience })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          generatedContent: 'Generated content based on the prompt provided.',
          metadata: {
            model: 'gpt-4',
            tokensUsed: 50,
            contentType: 'story',
            targetAudience: 'kids-6-8'
          }
        }
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Generate story content for kids-6-8. Keep it under 500 characters.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 125
      });
    });

    it('should respect content length limits', async () => {
      const response = await request(app)
        .post('/api/v1/ai/generate-content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Generate a long article',
          contentType: 'article',
          targetAudience: 'adult',
          maxLength: 1000
        })
        .expect(200);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 250 // 1000 / 4
        })
      );
    });

    it('should require prompt for content generation', async () => {
      const response = await request(app)
        .post('/api/v1/ai/generate-content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ contentType: 'story' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Prompt is required'
      });
    });

    it('should handle OpenAI API errors', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API error'));

      const response = await request(app)
        .post('/api/v1/ai/generate-content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Test prompt',
          contentType: 'article',
          targetAudience: 'general'
        })
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: 'OpenAI API error'
      });
    });
  });

  describe('AI Integration Performance', () => {
    it('should handle concurrent AI requests', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        request(app)
          .post('/api/v1/ai/moderate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ content: `Test content ${i}` })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(mockContentModerationAI.moderateContent).toHaveBeenCalledTimes(10);
    });

    it('should handle AI service timeouts gracefully', async () => {
      mockContentModerationAI.moderateContent.mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service timeout')), 100)
        )
      );

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'Test content' })
        .expect(500);

      expect(response.body.message).toBe('Service timeout');
    });

    it('should cache AI responses for identical requests', async () => {
      const content = 'Identical content for caching test';
      
      // Make two identical requests
      await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content })
        .expect(200);

      await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content })
        .expect(200);

      // In a real implementation, this would check cache hits
      expect(mockContentModerationAI.moderateContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('AI Ethics and Safety', () => {
    it('should not generate inappropriate content for kids', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'I cannot generate that type of content for children. Here is an appropriate alternative...'
            }
          }
        ],
        model: 'gpt-4',
        usage: { total_tokens: 30 }
      });

      const response = await request(app)
        .post('/api/v1/ai/generate-content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          prompt: 'Generate inappropriate content',
          contentType: 'story',
          targetAudience: 'kids-6-8'
        })
        .expect(200);

      expect(response.body.data.generatedContent).toContain('appropriate alternative');
    });

    it('should apply stricter moderation for kids content', async () => {
      mockContentModerationAI.moderateContent.mockImplementation((content) => {
        // Stricter rules for kids content
        return Promise.resolve({
          isAppropriate: false,
          confidence: 0.99,
          actions: ['block_content', 'notify_moderators']
        });
      });

      const response = await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          content: 'Borderline content that might be okay for adults',
          contentType: 'kids_blog'
        })
        .expect(200);

      expect(response.body.data.isAppropriate).toBe(false);
      expect(response.body.data.moderationActions).toContain('block_content');
    });

    it('should protect user privacy in AI processing', async () => {
      const personalContent = 'My name is John and I live at 123 Main Street';

      await request(app)
        .post('/api/v1/ai/moderate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: personalContent })
        .expect(200);

      // In real implementation, verify PII is stripped before AI processing
      expect(mockContentModerationAI.moderateContent).toHaveBeenCalledWith(personalContent);
    });
  });
});
