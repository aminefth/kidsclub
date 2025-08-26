import { Response, NextFunction } from 'express';
import { 
  AuthenticatedRequest, 
  UserRegistrationSchema, 
  UserLoginSchema, 
  UserUpdateSchema,
  UserProfile,
  ApiResponse,
  UserRole
} from '../types/api.types';
import { ResponseUtil, asyncHandler, ValidationError, AuthenticationError, NotFoundError } from '../utils/response.utils';
import { userModel } from '../models/user.model';
import { redis } from '../utils/redis';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import sendMail from '../utils/sendMail';
import imageKit from '../utils/imagekit';

/**
 * Enhanced User Controller with robust TypeScript types and validation
 * Enterprise-grade implementation with comprehensive error handling
 */

export class UserController {
  /**
   * Register new user with comprehensive validation
   */
  static registerUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Validation is handled by middleware, data is already validated
      const { name, email, password, dateOfBirth, country, acceptTerms } = req.body;

      // Check if user already exists
      const existingUser = await userModel.findOne({ email });
      if (existingUser) {
        return ResponseUtil.conflict(res, 'User with this email already exists');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await userModel.create({
        name,
        email,
        password: hashedPassword,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        country,
        isVerified: false,
        role: 'user',
        status: 'pending'
      });

      // Generate activation token
      const activationToken = user.SignAccessToken();
      const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

      // Store activation code in Redis (expires in 5 minutes)
      await redis.setex(`activation:${user._id}`, 300, activationCode);

      // Send activation email
      try {
        await sendMail({
          email: user.email,
          subject: 'Password Reset',
          template: 'password-reset.ejs',
          data: { user: { name: user.name }, resetCode: activationCode }
        } as any);
      } catch (emailError) {
        // Log email error but don't fail registration
        console.error('Failed to send activation email:', emailError);
      }

      // Prepare response data (exclude sensitive information)
      const responseData = {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          country: user.country,
          createdAt: user.createdAt
        },
        activationToken
      };

      return ResponseUtil.success(
        res,
        responseData,
        'User registered successfully. Please check your email for activation code.',
        201
      );

    } catch (error: any) {
      return ResponseUtil.error(res, 'Registration failed', 500, error);
    }
  });

  /**
   * Activate user account with validation
   */
  static activateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { activation_token, activation_code } = req.body;

      if (!activation_token || !activation_code) {
        return ResponseUtil.validationError(res, [
          { field: 'activation_token', message: 'Activation token is required' },
          { field: 'activation_code', message: 'Activation code is required' }
        ]);
      }

      // Verify activation token
      const decoded = jwt.verify(activation_token, process.env.ACCESS_TOKEN as string) as any;
      
      // Get stored activation code from Redis
      const storedCode = await redis.get(`activation:${decoded.id}`);
      
      if (!storedCode || storedCode !== activation_code) {
        return ResponseUtil.error(res, 'Invalid or expired activation code', 400);
      }

      // Find and activate user
      const user = await userModel.findById(decoded.id);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      if (user.isVerified) {
        return ResponseUtil.conflict(res, 'User is already activated');
      }

      // Activate user
      user.role = 'activated' as any;
      (user as any).status = 'active';
      await user.save();

      // Clean up activation code
      await redis.del(`activation:${decoded.id}`);

      const responseData: Partial<UserProfile> = {
        _id: user._id as string,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        status: (user as any).status,
        isVerified: user.isVerified,
        createdAt: (user as any).createdAt,
        avatar: user.avatar?.url
      };

      return ResponseUtil.success(
        res,
        responseData,
        'Account activated successfully'
      );

    } catch (error: any) {
      if (error.name === 'JsonWebTokenError') {
        return ResponseUtil.error(res, 'Invalid activation token', 400);
      }
      return ResponseUtil.error(res, 'Account activation failed', 500, error);
    }
  });

  /**
   * Login user with enhanced security
   */
  static loginUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { email, password, rememberMe } = req.body;

      // Find user and include password for verification
      const user = await userModel.findOne({ email }).select('+password');
      if (!user) {
        return ResponseUtil.unauthorized(res, 'Invalid email or password');
      }

      // Check if user is active
      if (user.status !== 'active') {
        return ResponseUtil.forbidden(res, 'Account is not active. Please contact support.');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return ResponseUtil.unauthorized(res, 'Invalid email or password');
      }

      // Generate tokens
      const accessToken = user.SignAccessToken();
      const refreshToken = user.SignRefreshToken();

      // Set token expiration based on rememberMe
      const tokenExpiry = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60; // 30 days or 1 day

      // Store refresh token in Redis
      await redis.setex(`refresh_token:${user._id}`, tokenExpiry, refreshToken);

      // Update last active
      user.lastActive = new Date();
      await user.save();

      // Set HTTP-only cookies
      res.cookie('access_token', accessToken, {
        expires: new Date(Date.now() + tokenExpiry * 1000),
        maxAge: tokenExpiry * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });

      res.cookie('refresh_token', refreshToken, {
        expires: new Date(Date.now() + tokenExpiry * 1000),
        maxAge: tokenExpiry * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });

      // Prepare response data
      const responseData = {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          avatar: typeof user.avatar === 'object' ? user.avatar?.url : user.avatar,
          isVerified: user.isVerified,
          lastActive: user.lastActive
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: tokenExpiry
        }
      };

      return ResponseUtil.success(
        res,
        responseData,
        'Login successful'
      );

    } catch (error: any) {
      return ResponseUtil.error(res, 'Login failed', 500, error);
    }
  });

  /**
   * Get user profile with comprehensive data
   */
  static getUserInfo = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      const user = await userModel.findById(userId)
        .populate('followers', 'name avatar')
        .populate('following', 'name avatar');

      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      // Get additional stats
      const [postsCount, notificationsCount] = await Promise.all([
        // Assuming you have a Blog model
        // BlogModel.countDocuments({ author: userId }),
        0, // Placeholder
        // NotificationModel.countDocuments({ recipient: userId, isRead: false })
        0  // Placeholder
      ]);

      const responseData: UserProfile = {
        _id: user._id as string,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        status: (user as any).status,
        avatar: typeof user.avatar === 'object' ? user.avatar?.url : user.avatar,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        country: user.country,
        interests: (user as any).interests || [],
        socialLinks: (user as any).socialLinks,
        followers: user.followers?.length || 0,
        following: user.following?.length || 0,
        postsCount,
        isVerified: user.isVerified,
        lastActive: (user as any).lastActive,
        createdAt: (user as any).createdAt,
        updatedAt: (user as any).updatedAt,
      };

      return ResponseUtil.success(res, responseData, 'User profile retrieved successfully');

    } catch (error: any) {
      return ResponseUtil.error(res, 'Failed to retrieve user profile', 500, error);
    }
  });

  /**
   * Update user profile with validation
   */
  static updateUserInfo = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      const user = await userModel.findById(userId);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      // Update allowed fields
      const allowedUpdates = ['name', 'bio', 'dateOfBirth', 'country', 'interests', 'socialLinks'];
      const updates = Object.keys(req.body)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj: any, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      // Apply updates
      Object.assign(user, updates);
      await user.save();

      const responseData: Partial<UserProfile> = {
        _id: user._id as string,
        name: user.name,
        email: user.email,
        bio: user.bio,
        dateOfBirth: user.dateOfBirth,
        country: user.country,
        interests: (user as any).interests,
        socialLinks: (user as any).socialLinks,
        updatedAt: (user as any).updatedAt
      };

      return ResponseUtil.success(res, responseData, 'Profile updated successfully');

    } catch (error: any) {
      return ResponseUtil.error(res, 'Failed to update profile', 500, error);
    }
  });

  /**
   * Upload and update user avatar
   */
  static updateProfilePicture = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      const { avatar } = req.body;
      if (!avatar) {
        return ResponseUtil.validationError(res, [
          { field: 'avatar', message: 'Avatar image is required' }
        ]);
      }

      const user = await userModel.findById(userId);
      if (!user) {
        return ResponseUtil.notFound(res, 'User not found');
      }

      // Upload to ImageKit
      const uploadResult = await (imageKit as any).upload({
        file: avatar,
        fileName: `avatar_${userId}_${Date.now()}`,
        folder: '/avatars',
        transformation: [{
          height: 200,
          width: 200,
          crop: 'maintain_ratio'
        }]
      });

      // Update user avatar
      user.avatar = uploadResult as any;
      await user.save();

      return ResponseUtil.success(
        res,
        { avatar: uploadResult.url },
        'Profile picture updated successfully'
      );

    } catch (error: any) {
      return ResponseUtil.error(res, 'Failed to update profile picture', 500, error);
    }
  });

  /**
   * Logout user
   */
  static logoutUser = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return ResponseUtil.unauthorized(res, 'User not authenticated');
      }

      // Remove refresh token from Redis
      await redis.del(`refresh_token:${userId}`);

      // Clear cookies
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      return ResponseUtil.success(res, null, 'Logged out successfully');

    } catch (error: any) {
      return ResponseUtil.error(res, 'Logout failed', 500, error);
    }
  });
}
