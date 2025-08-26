import express from 'express';
import { authorizeRoles, isAuthenticatedUser } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rateLimite';
import { addAnswer, addLike, addQuestion, addReadBlog, addReview, addReviewReply, createBlog, editBlog, getAllBlogs, getAllBlogsOnlyAdmin, getDraftBlogs, getSingleBlog, getSingleDraftBlog } from '../controllers/blog.controller';


const blogRouter = express.Router();
// authorize to create blog admin or author role and should be authenticated
blogRouter.post(
    "/create-blog",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("author"),
    createBlog
)
blogRouter.put(
    "/edit-blog/:id",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("author"),
    editBlog
)
blogRouter.get(
    "/get-blog/:id",
    authLimiter,
    getSingleBlog
)
blogRouter.get(
    "/get-blogs",
    authLimiter,
    getAllBlogs
)
blogRouter.get(
    "/all-blogs",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("admin"),
    getAllBlogsOnlyAdmin

)
blogRouter.get(
    "/get-draft-blogs",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("author"),
    getDraftBlogs
)
blogRouter.get(
    "/get-draft-blog/:id",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("author"),
    getSingleDraftBlog
)
blogRouter.put(
    "/add-question",
    authLimiter,
    isAuthenticatedUser,
    addQuestion
)
blogRouter.put(
    "/add-answer",
    authLimiter,
    isAuthenticatedUser,
    addAnswer
)
// put methode to add update the numbre of blogs read 
blogRouter.put(
    "/add-read-blog/:id",
    authLimiter,
    addReadBlog
)
// add likes to blog
blogRouter.put(
    "/add-likes/:id",
    authLimiter,
    isAuthenticatedUser,
    addLike
)
// add Review to blog with rating 
blogRouter.put(
    "/add-review/:id",
    authLimiter,
    isAuthenticatedUser,
    addReview
)
// add reply to review 
blogRouter.put(
    "/add-review-reply",
    authLimiter,
    isAuthenticatedUser,
    authorizeRoles("author", "admin"),
    addReviewReply
)

export default blogRouter;