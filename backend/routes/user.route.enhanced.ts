import express from 'express';
import {
  registerUser,
  activateUser,
  loginUser,
  logoutUser,
  updateAccessToken,
  getUserInfo,
  socialAuth,
  updateUserInfo,
  updatePassword,
  updateProfilePicture,
  getAllUsers,
  updateUserRole,
  deleteUser,
  forgotPassword,
  resetPassword
} from '../controllers/user.controller.enhanced';
import { isAuthenticated, authorizeRoles } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validation.middleware';
import { 
  registerSchema, 
  loginSchema, 
  activationSchema,
  updateUserInfoSchema,
  updatePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../types/api.types';
import { authLimiter } from '../middlewares/rateLimite';

const userRouterEnhanced = express.Router();

/**
 * Enhanced User Routes with robust validation and TypeScript types
 * Enterprise-grade route definitions with comprehensive middleware
 */

const router = express.Router();

// ================================
// AUTHENTICATION ROUTES
// ================================

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post(
  '/registration',
  authLimiter,
  sanitize,
  validate({
    body: UserRegistrationSchema
  }),
  UserController.registerUser
);

/**
 * @route   POST /api/v1/auth/activate
 * @desc    Activate user account
 * @access  Public
 */
router.post(
  '/activation',
  authLimiter,
  sanitize,
  validate({
    body: z.object({
      activation_token: z.string().min(1, 'Activation token is required'),
      activation_code: z.string().length(4, 'Activation code must be 4 digits')
    })
  }),
  UserController.activateUser
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  sanitize,
  validate({
    body: UserLoginSchema
  }),
  UserController.loginUser
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post(
  '/logout',
  isAuthenticatedUser,
  UserController.logoutUser
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 * @access  Private
 */
router.post(
  '/refresh',
  authLimiter,
  // UserController.updateAccessToken // TODO: Implement this method
);

// ================================
// PROFILE ROUTES
// ================================

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/me',
  authLimiter,
  isAuthenticatedUser,
  UserController.getUserInfo
);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  authLimiter,
  isAuthenticatedUser,
  sanitize,
  validate({
    body: UserUpdateSchema
  }),
  UserController.updateUserInfo
);

/**
 * @route   PUT /api/v1/auth/avatar
 * @desc    Update user avatar
 * @access  Private
 */
router.put(
  '/avatar',
  authLimiter,
  isAuthenticatedUser,
  sanitize,
  validate({
    body: z.object({
      avatar: z.string().min(1, 'Avatar data is required')
    })
  }),
  UserController.updateProfilePicture
);

/**
 * @route   PUT /api/v1/auth/password
 * @desc    Update user password
 * @access  Private
 */
router.put(
  '/password',
  authLimiter,
  isAuthenticatedUser,
  sanitize,
  validate({
    body: z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
               'Password must contain uppercase, lowercase, number and special character'),
      confirmPassword: z.string()
    }).refine(data => data.newPassword === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"]
    })
  }),
  // UserController.updatePassword // TODO: Implement this method
);

// ================================
// SOCIAL FEATURES ROUTES
// ================================

/**
 * @route   POST /api/v1/auth/follow/:userId
 * @desc    Follow a user
 * @access  Private
 */
router.post(
  '/follow/:userId',
  authLimiter,
  isAuthenticatedUser,
  validate({
    params: z.object({
      userId: CommonValidations.objectId
    })
  }),
  // UserController.followUser // TODO: Implement this method
);

/**
 * @route   DELETE /api/v1/auth/follow/:userId
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete(
  '/follow/:userId',
  authLimiter,
  isAuthenticatedUser,
  validate({
    params: z.object({
      userId: CommonValidations.objectId
    })
  }),
  // UserController.unfollowUser // TODO: Implement this method
);

/**
 * @route   GET /api/v1/auth/followers
 * @desc    Get user followers
 * @access  Private
 */
router.get(
  '/followers',
  authLimiter,
  isAuthenticatedUser,
  validate({
    query: CommonValidations.pagination
  }),
  // UserController.getFollowers // TODO: Implement this method
);

/**
 * @route   GET /api/v1/auth/following
 * @desc    Get users that current user is following
 * @access  Private
 */
router.get(
  '/following',
  authLimiter,
  isAuthenticatedUser,
  validate({
    query: CommonValidations.pagination
  }),
  // UserController.getFollowing // TODO: Implement this method
);

// ================================
// ADMIN ROUTES
// ================================

/**
 * @route   GET /api/v1/auth/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
router.get(
  '/users',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  validate({
    query: z.object({
      ...CommonValidations.pagination.shape,
      status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
      role: z.enum(['user', 'author', 'moderator', 'admin']).optional(),
      search: z.string().optional()
    })
  }),
  // UserController.getAllUsers // TODO: Implement this method
);

/**
 * @route   PUT /api/v1/auth/users/:userId/role
 * @desc    Update user role (Admin only)
 * @access  Private/Admin
 */
router.put(
  '/users/:userId/role',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  validate({
    params: z.object({
      userId: CommonValidations.objectId
    }),
    body: z.object({
      role: z.enum(['user', 'author', 'moderator', 'admin'])
    })
  }),
  // UserController.updateUserRole // TODO: Implement this method
);

/**
 * @route   PUT /api/v1/auth/users/:userId/status
 * @desc    Update user status (Admin only)
 * @access  Private/Admin
 */
router.put(
  '/users/:userId/status',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  validate({
    params: z.object({
      userId: CommonValidations.objectId
    }),
    body: z.object({
      status: z.enum(['active', 'inactive', 'suspended']),
      reason: z.string().min(10, 'Reason must be at least 10 characters').optional()
    })
  }),
  // UserController.updateUserStatus // TODO: Implement this method
);

/**
 * @route   DELETE /api/v1/auth/users/:userId
 * @desc    Delete user (Admin only)
 * @access  Private/Admin
 */
router.delete(
  '/users/:userId',
  authLimiter,
  isAuthenticatedUser,
  authorizeRoles('admin'),
  validate({
    params: z.object({
      userId: CommonValidations.objectId
    })
  }),
  // UserController.deleteUser // TODO: Implement this method
);

export default router;
