import { Request, Response, NextFunction } from "express";
import CommentModel, { IComment } from "../models/comment.model";
import BlogModel from "../models/blogs.model";
import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { realtimeService } from "../server";

/**
 * @swagger
 * /api/v1/comments:
 *   post:
 *     summary: Create a new comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - blogId
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *               blogId:
 *                 type: string
 *               parentId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
export const createComment = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content, blogId, parentId } = req.body;
      const userId = req.user?._id as string;

      // Validate blog exists
      const blog = await BlogModel.findById(blogId);
      if (!blog) {
        return next(new ErrorHandler('Blog not found', 404));
      }

      // Calculate depth for nested comments
      let depth = 0;
      if (parentId) {
        const parentComment = await CommentModel.findById(parentId);
        if (!parentComment) {
          return next(new ErrorHandler('Parent comment not found', 404));
        }
        depth = parentComment.depth + 1;
        
        // Limit nesting depth
        if (depth > 5) {
          return next(new ErrorHandler('Maximum comment nesting depth exceeded', 400));
        }
      }

      // Create comment
      const comment = new CommentModel({
        content,
        author: userId,
        blogId,
        parentId: parentId || null,
        depth,
        isKidsSafe: !blog.isKidsContent || true, // Default to safe for kids content
      });

      await comment.save();
      await comment.populate('author', 'name avatar');

      // Update parent comment reply count
      if (parentId) {
        await CommentModel.findByIdAndUpdate(parentId, {
          $inc: { replyCount: 1 }
        });
      }

      // Update blog comment count
      await BlogModel.findByIdAndUpdate(blogId, {
        $inc: { 'activity.total_comments': 1 }
      });

      // Emit real-time event
      realtimeService.emitNewComment(blogId, comment);

      res.status(201).json({
        success: true,
        comment,
        message: 'Comment created successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/comments/{blogId}:
 *   get:
 *     summary: Get comments for a blog post
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: blogId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [newest, oldest, popular]
 *           default: newest
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 */
export const getComments = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { blogId } = req.params;
      const { page = 1, limit = 20, sortBy = 'newest' } = req.query;

      // Build sort criteria
      let sortCriteria: any = { createdAt: -1 }; // newest first
      if (sortBy === 'oldest') {
        sortCriteria = { createdAt: 1 };
      } else if (sortBy === 'popular') {
        sortCriteria = { totalReactions: -1, createdAt: -1 };
      }

      // Get top-level comments (no parent)
      const comments = await CommentModel.find({
        blogId,
        parentId: null,
        isFlagged: false
      })
        .populate('author', 'name avatar')
        .sort(sortCriteria)
        .limit(parseInt(limit as string))
        .skip((parseInt(page as string) - 1) * parseInt(limit as string));

      // Get replies for each comment (limited depth)
      const commentsWithReplies = await Promise.all(
        comments.map(async (comment) => {
          const replies = await CommentModel.find({
            blogId,
            parentId: comment._id,
            isFlagged: false
          })
            .populate('author', 'name avatar')
            .sort({ createdAt: 1 })
            .limit(10); // Limit replies per comment

          return {
            ...comment.toObject(),
            replies
          };
        })
      );

      const total = await CommentModel.countDocuments({
        blogId,
        parentId: null,
        isFlagged: false
      });

      res.status(200).json({
        success: true,
        comments: commentsWithReplies,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/comments/{commentId}/react:
 *   post:
 *     summary: React to a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [like, dislike, heart, laugh]
 *     responses:
 *       200:
 *         description: Reaction updated successfully
 */
export const reactToComment = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const { type } = req.body;
      const userId = req.user?._id as string;

      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        return next(new ErrorHandler('Comment not found', 404));
      }

      // Remove user from all reaction types first
      const reactionTypes = ['likes', 'dislikes', 'hearts', 'laughs'];
      reactionTypes.forEach(reactionType => {
        comment.reactions[reactionType as keyof typeof comment.reactions] = 
          comment.reactions[reactionType as keyof typeof comment.reactions].filter(
            (id: any) => id.toString() !== userId
          );
      });

      // Add user to the specified reaction type
      if (type && reactionTypes.includes(`${type}s`)) {
        comment.reactions[`${type}s` as keyof typeof comment.reactions].push(userId as any);
      }

      await comment.save();

      // Emit real-time reaction update
      realtimeService.emitCommentReaction(comment.blogId.toString(), commentId, {
        type,
        userId,
        totalReactions: comment.totalReactions
      });

      res.status(200).json({
        success: true,
        message: 'Reaction updated successfully',
        reactions: comment.reactions
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/comments/{commentId}:
 *   put:
 *     summary: Update a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *     responses:
 *       200:
 *         description: Comment updated successfully
 *       403:
 *         description: Not authorized to update this comment
 *       404:
 *         description: Comment not found
 */
export const updateComment = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const userId = req.user?._id as string;

      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        return next(new ErrorHandler('Comment not found', 404));
      }

      // Check if user owns the comment
      if (comment.author.toString() !== userId) {
        return next(new ErrorHandler('Not authorized to update this comment', 403));
      }

      comment.content = content;
      await comment.save();

      res.status(200).json({
        success: true,
        comment,
        message: 'Comment updated successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/comments/{commentId}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Comment deleted successfully
 *       403:
 *         description: Not authorized to delete this comment
 *       404:
 *         description: Comment not found
 */
export const deleteComment = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const userId = req.user?._id as string;
      const userRole = req.user?.role;

      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        return next(new ErrorHandler('Comment not found', 404));
      }

      // Check if user owns the comment or is admin/moderator
      if (comment.author.toString() !== userId && !['admin', 'moderator'].includes(userRole as string)) {
        return next(new ErrorHandler('Not authorized to delete this comment', 403));
      }

      // Soft delete - mark as flagged instead of hard delete to preserve thread structure
      comment.isFlagged = true;
      comment.content = '[Comment deleted]';
      await comment.save();

      // Update blog comment count
      await BlogModel.findByIdAndUpdate(comment.blogId, {
        $inc: { 'activity.total_comments': -1 }
      });

      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * @swagger
 * /api/v1/comments/{commentId}/flag:
 *   post:
 *     summary: Flag a comment for moderation
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [spam, inappropriate, harassment, other]
 *               details:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment flagged successfully
 */
export const flagComment = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { commentId } = req.params;
      const { reason, details } = req.body;

      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        return next(new ErrorHandler('Comment not found', 404));
      }

      // Add flag reason
      if (!comment.flagReasons) {
        comment.flagReasons = [];
      }
      comment.flagReasons.push(reason);
      comment.isFlagged = true;

      await comment.save();

      res.status(200).json({
        success: true,
        message: 'Comment flagged for moderation'
      });

    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
