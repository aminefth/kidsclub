import express from "express";
import { 
  createComment,
  getComments,
  reactToComment,
  updateComment,
  deleteComment,
  flagComment
} from "../controllers/comments.controller";
import { isAuthenticatedUser, authorizeRoles } from "../middlewares/auth";
import { validateRequest } from "../middlewares/validation";
import { body, param } from "express-validator";

const commentsRouter = express.Router();

// Validation rules
const createCommentValidation = [
  body('content')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters'),
  body('blogId')
    .isMongoId()
    .withMessage('Invalid blog ID'),
  body('parentId')
    .optional()
    .isMongoId()
    .withMessage('Invalid parent comment ID')
];

const reactValidation = [
  body('type')
    .isIn(['like', 'dislike', 'heart', 'laugh'])
    .withMessage('Invalid reaction type')
];

const flagValidation = [
  body('reason')
    .isIn(['spam', 'inappropriate', 'harassment', 'other'])
    .withMessage('Invalid flag reason'),
  body('details')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Details must be less than 500 characters')
];

// Routes
commentsRouter.post(
  "/",
  isAuthenticatedUser,
  createCommentValidation,
  validateRequest,
  createComment
);

commentsRouter.get(
  "/:blogId",
  param('blogId').isMongoId().withMessage('Invalid blog ID'),
  validateRequest,
  getComments
);

commentsRouter.post(
  "/:commentId/react",
  isAuthenticatedUser,
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  reactValidation,
  validateRequest,
  reactToComment
);

commentsRouter.put(
  "/:commentId",
  isAuthenticatedUser,
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  body('content').isLength({ min: 1, max: 2000 }).withMessage('Content must be between 1 and 2000 characters'),
  validateRequest,
  updateComment
);

commentsRouter.delete(
  "/:commentId",
  isAuthenticatedUser,
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  validateRequest,
  deleteComment
);

commentsRouter.post(
  "/:commentId/flag",
  isAuthenticatedUser,
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
  flagValidation,
  validateRequest,
  flagComment
);

export default commentsRouter;
