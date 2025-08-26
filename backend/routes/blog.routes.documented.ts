import express from 'express';
import {
  createBlog,
  updateBlog,
  getSingleBlog,
  getAllBlogs,
  deleteBlog,
  likeBlog,
  addReview,
  addReplyToReview
} from '../controllers/blog.controller';
import { isAuthenticated, authorizeRoles } from '../middlewares/auth';
import { validateRequest } from '../middlewares/validation.middleware';

const router = express.Router();

/**
 * @swagger
 * /api/v1/blogs:
 *   post:
 *     tags: [Blogs]
 *     summary: Create a new blog post
 *     description: |
 *       Creates a new blog post with content moderation and kids safety features.
 *       Authors can save as draft or publish immediately.
 *       
 *       **Features:**
 *       - Automatic content moderation
 *       - Kids safety filtering
 *       - SEO-friendly URL generation
 *       - Image upload support
 *       - Tag and category management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBlogRequest'
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/CreateBlogRequest'
 *               - type: object
 *                 properties:
 *                   banner:
 *                     type: string
 *                     format: binary
 *                     description: "Blog banner image"
 *           examples:
 *             basic:
 *               summary: Basic blog creation
 *               value:
 *                 title: "Getting Started with Node.js in 2025"
 *                 description: "A comprehensive guide to starting your Node.js journey"
 *                 content: "# Introduction\n\nNode.js is a powerful runtime..."
 *                 tags: ["nodejs", "javascript", "tutorial", "beginner"]
 *                 category: "Technology"
 *                 draft: false
 *                 isKidsSafe: true
 *                 ageRating: "all"
 *     responses:
 *       201:
 *         description: Blog created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           description: "Blog ID"
 *                           example: "getting-started-with-nodejs-2025"
 *                         _id:
 *                           type: string
 *                           description: "Database ID"
 *                           example: "64f8a1b2c3d4e5f6a7b8c9d0"
 *             example:
 *               success: true
 *               message: "Blog created successfully"
 *               data:
 *                 id: "getting-started-with-nodejs-2025"
 *                 _id: "64f8a1b2c3d4e5f6a7b8c9d0"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Insufficient permissions (author role required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Author role required to create blog posts"
 *               error: "INSUFFICIENT_PERMISSIONS"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/', isAuthenticated, authorizeRoles('author', 'admin'), createBlog);

/**
 * @swagger
 * /api/v1/blogs:
 *   get:
 *     tags: [Blogs]
 *     summary: Get all published blog posts
 *     description: |
 *       Retrieves paginated list of published blog posts with filtering and search capabilities.
 *       Supports advanced filtering by category, tags, author, and kids safety.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of posts per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and content
 *         example: "nodejs tutorial"
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *         example: "Technology"
 *       - in: query
 *         name: tags
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: false
 *         description: Filter by tags (comma-separated)
 *         example: "nodejs,javascript"
 *       - in: query
 *         name: author
 *         schema:
 *           type: string
 *         description: Filter by author ID
 *         example: "64f8a1b2c3d4e5f6a7b8c9d0"
 *       - in: query
 *         name: isKidsSafe
 *         schema:
 *           type: boolean
 *         description: Filter by kids safety
 *         example: true
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, popular, trending]
 *           default: newest
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Blog posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogsListResponse'
 *             examples:
 *               success:
 *                 summary: Paginated blog list
 *                 value:
 *                   success: true
 *                   message: "Blogs retrieved successfully"
 *                   data:
 *                     items:
 *                       - _id: "64f8a1b2c3d4e5f6a7b8c9d0"
 *                         blog_id: "getting-started-with-nodejs-2025"
 *                         title: "Getting Started with Node.js in 2025"
 *                         description: "A comprehensive guide to starting your Node.js journey"
 *                         banner:
 *                           url: "https://ik.imagekit.io/kidsclub/blogs/banner123.jpg"
 *                         tags: ["nodejs", "javascript", "tutorial"]
 *                         category: "Technology"
 *                         author:
 *                           _id: "64f8a1b2c3d4e5f6a7b8c9d1"
 *                           name: "John Doe"
 *                           avatar:
 *                             url: "https://ik.imagekit.io/kidsclub/avatars/user123.jpg"
 *                         activity:
 *                           total_likes: 42
 *                           total_comments: 15
 *                           total_reads: 1250
 *                         isKidsSafe: true
 *                         ageRating: "all"
 *                         publishedAt: "2025-08-26T21:50:13.608Z"
 *                     pagination:
 *                       currentPage: 1
 *                       totalPages: 10
 *                       totalItems: 200
 *                       itemsPerPage: 20
 *                       hasNextPage: true
 *                       hasPreviousPage: false
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *     security: []
 */
router.get('/', getAllBlogs);

/**
 * @swagger
 * /api/v1/blogs/{id}:
 *   get:
 *     tags: [Blogs]
 *     summary: Get a single blog post
 *     description: |
 *       Retrieves a single published blog post by ID with full content and metadata.
 *       Automatically tracks view analytics and updates read count.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *     responses:
 *       200:
 *         description: Blog post retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BlogResponse'
 *             examples:
 *               success:
 *                 summary: Full blog post
 *                 value:
 *                   success: true
 *                   message: "Blog found"
 *                   data:
 *                     _id: "64f8a1b2c3d4e5f6a7b8c9d0"
 *                     blog_id: "getting-started-with-nodejs-2025"
 *                     title: "Getting Started with Node.js in 2025"
 *                     description: "A comprehensive guide to starting your Node.js journey"
 *                     content: "# Introduction\n\nNode.js is a powerful runtime..."
 *                     banner:
 *                       url: "https://ik.imagekit.io/kidsclub/blogs/banner123.jpg"
 *                     tags: ["nodejs", "javascript", "tutorial", "beginner"]
 *                     category: "Technology"
 *                     author:
 *                       _id: "64f8a1b2c3d4e5f6a7b8c9d1"
 *                       name: "John Doe"
 *                       avatar:
 *                         url: "https://ik.imagekit.io/kidsclub/avatars/user123.jpg"
 *                       isVerified: true
 *                     activity:
 *                       total_likes: 42
 *                       total_comments: 15
 *                       total_reads: 1251
 *                       total_parent_comments: 12
 *                     reviews:
 *                       - _id: "64f8a1b2c3d4e5f6a7b8c9d2"
 *                         user:
 *                           name: "Jane Smith"
 *                           avatar:
 *                             url: "https://ik.imagekit.io/kidsclub/avatars/user456.jpg"
 *                         comment: "Great article! Very helpful."
 *                         rating: 5
 *                         createdAt: "2025-08-26T21:45:13.608Z"
 *                     isKidsSafe: true
 *                     ageRating: "all"
 *                     publishedAt: "2025-08-26T21:50:13.608Z"
 *                     createdAt: "2025-08-26T20:30:13.608Z"
 *                     updatedAt: "2025-08-26T21:50:13.608Z"
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *     security: []
 */
router.get('/:id', getSingleBlog);

/**
 * @swagger
 * /api/v1/blogs/{id}:
 *   put:
 *     tags: [Blogs]
 *     summary: Update a blog post
 *     description: |
 *       Updates an existing blog post. Only the author or admin can update a blog.
 *       Supports partial updates and maintains version history.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBlogRequest'
 *         multipart/form-data:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/UpdateBlogRequest'
 *               - type: object
 *                 properties:
 *                   banner:
 *                     type: string
 *                     format: binary
 *                     description: "New blog banner image"
 *     responses:
 *       200:
 *         description: Blog updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "getting-started-with-nodejs-2025"
 *             example:
 *               success: true
 *               message: "Blog updated successfully"
 *               data:
 *                 id: "getting-started-with-nodejs-2025"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not authorized to update this blog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "You can only update your own blog posts"
 *               error: "FORBIDDEN"
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.put('/:id', isAuthenticated, updateBlog);

/**
 * @swagger
 * /api/v1/blogs/{id}:
 *   delete:
 *     tags: [Blogs]
 *     summary: Delete a blog post
 *     description: |
 *       Deletes a blog post. Only the author or admin can delete a blog.
 *       This action is irreversible and will also delete all associated comments and analytics.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *     responses:
 *       200:
 *         description: Blog deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               message: "Blog deleted successfully"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Not authorized to delete this blog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "You can only delete your own blog posts"
 *               error: "FORBIDDEN"
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.delete('/:id', isAuthenticated, deleteBlog);

/**
 * @swagger
 * /api/v1/blogs/{id}/like:
 *   post:
 *     tags: [Blogs]
 *     summary: Like or unlike a blog post
 *     description: |
 *       Toggles like status for a blog post. If already liked, removes the like.
 *       If not liked, adds a like. Updates analytics in real-time.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *     responses:
 *       200:
 *         description: Like status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         liked:
 *                           type: boolean
 *                           description: "Current like status"
 *                           example: true
 *                         totalLikes:
 *                           type: integer
 *                           description: "Total number of likes"
 *                           example: 43
 *             examples:
 *               liked:
 *                 summary: Blog liked
 *                 value:
 *                   success: true
 *                   message: "Blog liked successfully"
 *                   data:
 *                     liked: true
 *                     totalLikes: 43
 *               unliked:
 *                 summary: Blog unliked
 *                 value:
 *                   success: true
 *                   message: "Blog unliked successfully"
 *                   data:
 *                     liked: false
 *                     totalLikes: 42
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/like', isAuthenticated, likeBlog);

/**
 * @swagger
 * /api/v1/blogs/{id}/reviews:
 *   post:
 *     tags: [Blogs]
 *     summary: Add a review to a blog post
 *     description: |
 *       Adds a review with rating and comment to a blog post.
 *       Reviews are automatically moderated for inappropriate content.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddReviewRequest'
 *           examples:
 *             positive:
 *               summary: Positive review
 *               value:
 *                 comment: "Excellent tutorial! Very well explained and easy to follow."
 *                 rating: 5
 *             constructive:
 *               summary: Constructive feedback
 *               value:
 *                 comment: "Good content but could use more examples in the advanced sections."
 *                 rating: 4
 *     responses:
 *       201:
 *         description: Review added successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BlogReview'
 *             example:
 *               success: true
 *               message: "Review added successfully"
 *               data:
 *                 _id: "64f8a1b2c3d4e5f6a7b8c9d2"
 *                 user:
 *                   _id: "64f8a1b2c3d4e5f6a7b8c9d0"
 *                   name: "Jane Smith"
 *                   avatar:
 *                     url: "https://ik.imagekit.io/kidsclub/avatars/user456.jpg"
 *                 comment: "Excellent tutorial! Very well explained and easy to follow."
 *                 rating: 5
 *                 createdAt: "2025-08-26T21:55:13.608Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: User has already reviewed this blog
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "You have already reviewed this blog post"
 *               error: "REVIEW_EXISTS"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/reviews', isAuthenticated, addReview);

/**
 * @swagger
 * /api/v1/blogs/{id}/reviews/{reviewId}/reply:
 *   post:
 *     tags: [Blogs]
 *     summary: Reply to a blog review
 *     description: |
 *       Adds a reply to an existing review. Only the blog author or admin can reply to reviews.
 *       Replies help authors engage with their audience and provide additional context.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog ID or database ObjectId
 *         example: "getting-started-with-nodejs-2025"
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: string
 *         description: Review ID
 *         example: "64f8a1b2c3d4e5f6a7b8c9d2"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReplyToReviewRequest'
 *           examples:
 *             thankful:
 *               summary: Thank you reply
 *               value:
 *                 comment: "Thank you for the positive feedback! I'm glad you found it helpful."
 *             clarification:
 *               summary: Clarification reply
 *               value:
 *                 comment: "Thanks for the suggestion! I'll add more examples in the next update."
 *     responses:
 *       201:
 *         description: Reply added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               message: "Reply added successfully"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Only blog author can reply to reviews
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Only the blog author can reply to reviews"
 *               error: "FORBIDDEN"
 *       404:
 *         description: Blog or review not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               blog_not_found:
 *                 summary: Blog not found
 *                 value:
 *                   success: false
 *                   message: "Blog not found"
 *                   error: "BLOG_NOT_FOUND"
 *               review_not_found:
 *                 summary: Review not found
 *                 value:
 *                   success: false
 *                   message: "Review not found"
 *                   error: "REVIEW_NOT_FOUND"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post('/:id/reviews/:reviewId/reply', isAuthenticated, addReplyToReview);

export default router;
