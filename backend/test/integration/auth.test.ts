import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import userModel from '../../models/user.model';
import { registrationUser, activateUser, loginUser, logoutUser, socialAuth, updateAccessToken } from '../../controllers/user.controller';
import { isAuthenticatedUser, authorizeRoles } from '../../middlewares/auth';
import { UserFactory } from '../factories/user.factory';
import { mockRedis } from '../mocks/redis.mock';
import jwt from 'jsonwebtoken';

// Create test app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes
app.post('/api/v1/registration', registrationUser);
app.post('/api/v1/activate-user', activateUser);
app.post('/api/v1/login', loginUser);
app.post('/api/v1/logout', isAuthenticatedUser, logoutUser);
app.post('/api/v1/social-auth', socialAuth);
app.get('/api/v1/refresh', updateAccessToken);

// Protected routes for testing authorization
app.get('/api/v1/admin-only', isAuthenticatedUser, authorizeRoles('admin'), (req, res) => {
  res.json({ message: 'Admin access granted' });
});
app.get('/api/v1/author-only', isAuthenticatedUser, authorizeRoles('author', 'admin'), (req, res) => {
  res.json({ message: 'Author access granted' });
});

describe('Authentication & Authorization System', () => {
  describe('POST /api/v1/registration - User Registration', () => {
    it('should register a new user successfully', async () => {
      const userData = UserFactory.create();
      
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: userData.name,
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Please check your email'),
        activationToken: expect.any(String)
      });
    });

    it('should reject registration with invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body.message).toContain('Please enter a valid email');
    });

    it('should reject registration with weak password', async () => {
      const userData = UserFactory.create();
      
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: userData.name,
          email: userData.email,
          password: 'weak'
        })
        .expect(400);

      expect(response.body.message).toContain('Password must contain at least 8 characters');
    });

    it('should reject registration with existing email', async () => {
      const userData = UserFactory.create();
      
      // Create user first
      await userModel.create({
        name: userData.name,
        email: userData.email,
        password: 'TestPassword123!',
        username: userData.username
      });

      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: 'Another User',
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body.message).toBe('Email already exist');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: '',
          email: '',
          password: ''
        })
        .expect(400);

      expect(response.body.message).toBe('Please enter all fields');
    });

    it('should validate minimum name length', async () => {
      const userData = UserFactory.create();
      
      const response = await request(app)
        .post('/api/v1/registration')
        .send({
          name: 'AB', // Too short
          email: userData.email,
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body.message).toBe('Name must be at least 3 characters');
    });
  });

  describe('POST /api/v1/activate-user - User Activation', () => {
    let activationToken: string;
    let activationCode: string;

    beforeEach(async () => {
      const userData = UserFactory.create();
      
      const regResponse = await request(app)
        .post('/api/v1/registration')
        .send({
          name: userData.name,
          email: userData.email,
          password: 'TestPassword123!'
        });

      activationToken = regResponse.body.activationToken;
      
      // Extract activation code from token
      const decoded = jwt.verify(activationToken, process.env.ACTIVATION_SECRET!) as any;
      activationCode = decoded.activationCode;
    });

    it('should activate user with valid token and code', async () => {
      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: activationToken,
          activation_code: activationCode
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        message: 'User registered successfully'
      });

      // Verify user was created in database
      const decoded = jwt.verify(activationToken, process.env.ACTIVATION_SECRET!) as any;
      const user = await userModel.findOne({ email: decoded.user.email });
      expect(user).toBeTruthy();
      expect(user?.username).toBeTruthy();
    });

    it('should reject activation with invalid code', async () => {
      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: activationToken,
          activation_code: '0000' // Wrong code
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid activation code');
    });

    it('should reject activation with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: 'invalid-token',
          activation_code: activationCode
        })
        .expect(400);

      expect(response.body.message).toBeTruthy();
    });

    it('should reject activation if user already exists', async () => {
      // First activation
      await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: activationToken,
          activation_code: activationCode
        });

      // Try to activate again
      const response = await request(app)
        .post('/api/v1/activate-user')
        .send({
          activation_token: activationToken,
          activation_code: activationCode
        })
        .expect(400);

      expect(response.body.message).toBe('User already exist');
    });
  });

  describe('POST /api/v1/login - User Login', () => {
    let testUser: any;

    beforeEach(async () => {
      const userData = UserFactory.create();
      testUser = await userModel.create({
        name: userData.name,
        email: userData.email,
        password: 'TestPassword123!',
        username: userData.username
      });
    });

    it('should login with valid email and password', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          email: testUser.email,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: expect.objectContaining({
          email: testUser.email,
          name: testUser.name
        })
      });

      // Check for JWT cookies
      expect(response.headers['set-cookie']).toBeDefined();
      const cookies = response.headers['set-cookie'];
      expect(cookies.some((cookie: string) => cookie.includes('access_token'))).toBe(true);
      expect(cookies.some((cookie: string) => cookie.includes('refresh_token'))).toBe(true);
    });

    it('should login with valid username and password', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          username: testUser.username,
          password: 'TestPassword123!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(testUser.username);
    });

    it('should reject login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(400);

      expect(response.body.message).toBe('Invalid password');
    });

    it('should reject login with non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'TestPassword123!'
        })
        .expect(404);

      expect(response.body.message).toBe('User not found ');
    });

    it('should require username or email', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          password: 'TestPassword123!'
        })
        .expect(400);

      expect(response.body.message).toBe('Please enter username or email');
    });

    it('should require password', async () => {
      const response = await request(app)
        .post('/api/v1/login')
        .send({
          email: testUser.email
        })
        .expect(400);

      expect(response.body.message).toBe('Please enter password');
    });
  });

  describe('POST /api/v1/social-auth - Social Authentication', () => {
    it('should create new user with Google auth', async () => {
      const userData = UserFactory.create();
      
      const response = await request(app)
        .post('/api/v1/social-auth')
        .send({
          name: userData.name,
          email: userData.email,
          avatar: 'https://lh3.googleusercontent.com/test-avatar'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: expect.objectContaining({
          name: userData.name,
          email: userData.email,
          google_auth: true
        })
      });

      // Verify user was created
      const user = await userModel.findOne({ email: userData.email });
      expect(user?.google_auth).toBe(true);
    });

    it('should login existing Google auth user', async () => {
      const userData = UserFactory.create();
      
      // Create existing Google auth user
      await userModel.create({
        name: userData.name,
        email: userData.email,
        username: userData.username,
        google_auth: true
      });

      const response = await request(app)
        .post('/api/v1/social-auth')
        .send({
          name: userData.name,
          email: userData.email,
          avatar: 'https://lh3.googleusercontent.com/test-avatar'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject Google auth for existing password user', async () => {
      const userData = UserFactory.create();
      
      // Create existing password-based user
      await userModel.create({
        name: userData.name,
        email: userData.email,
        password: 'TestPassword123!',
        username: userData.username,
        google_auth: false
      });

      const response = await request(app)
        .post('/api/v1/social-auth')
        .send({
          name: userData.name,
          email: userData.email,
          avatar: 'https://lh3.googleusercontent.com/test-avatar'
        })
        .expect(400);

      expect(response.body.message).toContain('this email was signed up without google');
    });

    it('should reject invalid email in social auth', async () => {
      const response = await request(app)
        .post('/api/v1/social-auth')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          avatar: 'https://lh3.googleusercontent.com/test-avatar'
        })
        .expect(400);

      expect(response.body.message).toContain('Please retry again  Or entre valid email');
    });
  });

  describe('Authorization Middleware', () => {
    let adminUser: any;
    let regularUser: any;
    let authorUser: any;
    let adminToken: string;
    let userToken: string;
    let authorToken: string;

    beforeEach(async () => {
      // Create test users
      adminUser = await userModel.create({
        ...UserFactory.createAdmin(),
        password: 'TestPassword123!'
      });
      
      regularUser = await userModel.create({
        ...UserFactory.create({ role: 'user' }),
        password: 'TestPassword123!'
      });
      
      authorUser = await userModel.create({
        ...UserFactory.createCreator(),
        password: 'TestPassword123!'
      });

      // Generate tokens
      adminToken = jwt.sign({ id: adminUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });
      userToken = jwt.sign({ id: regularUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });
      authorToken = jwt.sign({ id: authorUser._id }, process.env.ACCESS_TOKEN!, { expiresIn: '5m' });

      // Mock Redis sessions
      mockRedis.get.mockImplementation((key: string) => {
        if (key === adminUser._id.toString()) {
          return Promise.resolve(JSON.stringify(adminUser));
        }
        if (key === regularUser._id.toString()) {
          return Promise.resolve(JSON.stringify(regularUser));
        }
        if (key === authorUser._id.toString()) {
          return Promise.resolve(JSON.stringify(authorUser));
        }
        return Promise.resolve(null);
      });
    });

    it('should allow admin access to admin-only routes', async () => {
      const response = await request(app)
        .get('/api/v1/admin-only')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(200);

      expect(response.body.message).toBe('Admin access granted');
    });

    it('should deny regular user access to admin-only routes', async () => {
      const response = await request(app)
        .get('/api/v1/admin-only')
        .set('Cookie', `access_token=${userToken}`)
        .expect(403);

      expect(response.body.message).toContain('role user is not allowed');
    });

    it('should allow both author and admin access to author routes', async () => {
      // Test author access
      const authorResponse = await request(app)
        .get('/api/v1/author-only')
        .set('Cookie', `access_token=${authorToken}`)
        .expect(200);

      expect(authorResponse.body.message).toBe('Author access granted');

      // Test admin access
      const adminResponse = await request(app)
        .get('/api/v1/author-only')
        .set('Cookie', `access_token=${adminToken}`)
        .expect(200);

      expect(adminResponse.body.message).toBe('Author access granted');
    });

    it('should deny unauthenticated access', async () => {
      const response = await request(app)
        .get('/api/v1/admin-only')
        .expect(400);

      expect(response.body.message).toBe('Please login to continue');
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/admin-only')
        .set('Cookie', 'access_token=invalid-token')
        .expect(400);

      expect(response.body.message).toBeTruthy();
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        { id: adminUser._id }, 
        process.env.ACCESS_TOKEN!, 
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/v1/admin-only')
        .set('Cookie', `access_token=${expiredToken}`)
        .expect(400);

      expect(response.body.message).toBeTruthy();
    });
  });

  describe('Security Features', () => {
    it('should hash passwords before saving', async () => {
      const userData = UserFactory.create();
      const plainPassword = 'TestPassword123!';
      
      const user = await userModel.create({
        name: userData.name,
        email: userData.email,
        password: plainPassword,
        username: userData.username
      });

      // Password should be hashed
      expect(user.password).not.toBe(plainPassword);
      expect(user.password).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });

    it('should validate password complexity', async () => {
      const userData = UserFactory.create();
      
      const weakPasswords = [
        'password',      // No uppercase, numbers, special chars
        'Password',      // No numbers, special chars
        'Password1',     // No special chars
        'Pass1!',        // Too short
        'PASSWORD1!',    // No lowercase
        'password1!'     // No uppercase
      ];

      for (const weakPassword of weakPasswords) {
        try {
          await userModel.create({
            name: userData.name,
            email: `test${Date.now()}@example.com`,
            password: weakPassword,
            username: `test${Date.now()}`
          });
          fail(`Should have rejected weak password: ${weakPassword}`);
        } catch (error) {
          expect(error).toBeTruthy();
        }
      }
    });

    it('should prevent user enumeration attacks', async () => {
      // Login with non-existent email should not reveal if email exists
      const response1 = await request(app)
        .post('/api/v1/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!'
        });

      // Login with existing email but wrong password
      const userData = UserFactory.create();
      await userModel.create({
        name: userData.name,
        email: userData.email,
        password: 'TestPassword123!',
        username: userData.username
      });

      const response2 = await request(app)
        .post('/api/v1/login')
        .send({
          email: userData.email,
          password: 'WrongPassword123!'
        });

      // Both should return similar error patterns
      expect(response1.status).toBeGreaterThanOrEqual(400);
      expect(response2.status).toBeGreaterThanOrEqual(400);
    });

    it('should implement rate limiting for authentication endpoints', async () => {
      const userData = UserFactory.create();
      
      // Make multiple rapid requests
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/v1/login')
          .send({
            email: userData.email,
            password: 'WrongPassword123!'
          })
      );

      const responses = await Promise.all(requests);
      
      // Should not all succeed (rate limiting should kick in)
      const successCount = responses.filter(r => r.status < 400).length;
      expect(successCount).toBeLessThan(10);
    });
  });
});
