import ejs from "ejs";

import { catchAsyncErrors } from "../middlewares/catchAsyncErrors";
import userModel from "../models/user.model";
import { Request, Response, NextFunction } from "express";
import ErrorHandler from "../utils/ErrorHandler";
import { nanoid } from 'nanoid';
import BlogModel from "../models/blogs.model";

import { redis } from "../utils/redis";
import mongoose from "mongoose";
import sendMail from "../utils/sendMail";
import path from 'path';
import NotificationModel from "../models/notification.model";
import { getAllBlogsService } from "../services/blog.service";


// interface blogData
interface IBlogData {
    title: string;
    des: string;
    banner: string;
    content: any;
    tags: string[];
    draft: boolean;
    isPublished: boolean;
}
const generateBlogId = (title: string) => {
    const cleanTitle = title.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
    const uniqueId = nanoid();
    return `${cleanTitle}-${uniqueId}`;
}
// upload blog
/**
 * Upload a new blog post
 *
 * @param {Request} req - Express request object 
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
export const createBlog = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get author ID from logged in user
            const authorId = req.user?._id;

            // Destructure blog data from request body
            let { title, des, banner, tags, content, draft, isPublished } = req.body as IBlogData;

            // Validate required fields
            if (!authorId) {
                return next(
                    new ErrorHandler("Please login to continue with author account", 401)
                );
            }

            if (!title) {
                return next(new ErrorHandler("Title is required", 400));
            }

            if (!des || des.length > 200) {
                return next(
                    new ErrorHandler(
                        "Description is required and must be under 200 characters",
                        400
                    )
                );
            }

            if (!banner) {
                return next(new ErrorHandler("Banner image is required", 400));
            }

            if (!content || !content.blocks.length) {
                return next(new ErrorHandler("Blog content is required", 400));
            }

            if (!tags || tags.length === 0 || tags.length > 5) {
                return next(
                    new ErrorHandler("Between 1 and 5 tags are required", 400)
                );
            }

            // Format tags
            tags = tags.map(tag => tag.toLowerCase());

            // Generate unique blog ID  
            const blog_id = generateBlogId(title);

            const newBlog = {
                blog_id,
                title,
                des,
                banner,
                content,
                tags,
                author: authorId,
                draft: Boolean(draft),
                isPublished: Boolean(isPublished)
            };
            const blog = await BlogModel.create(newBlog);
            // find user and updated 
            /*  await updateUserBlogs(blog._id, authorId, res, next); */
            if (blog) {

                const incrementVal = blog.draft ? 0 : 1;

                const user = await userModel.findByIdAndUpdate({ _id: authorId }, { $inc: { "account_info.total_posts": incrementVal }, $push: { blogs: blog._id } });

                await redis.set(authorId, JSON.stringify(user));
            }


            return res.status(201).json({
                success: true,
                message: "Blog created successfully",
                id: newBlog.blog_id,

            })

        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    }
);

// edit blog 
export const editBlog = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const authorId = req.user?._id;
            const id = req.params.id;
            let { title, des, banner, tags, content, draft, isPublished } = req.body as IBlogData;
            const updatedBlog = await BlogModel.findById(id);
            if (!authorId) {
                return next(
                    new ErrorHandler("Please login to continue with author account", 401)
                );
            }

            if (!updatedBlog) {
                return next(new ErrorHandler("Blog not found", 404));
            }

            if (des?.length > 200) {
                return next(
                    new ErrorHandler(
                        "Description is required and must be under 200 characters",
                        400
                    )
                );
            }
            if (tags?.length > 5) {
                return next(
                    new ErrorHandler("Between 1 and 5 tags are required", 400)
                );
            }

            if (banner && updatedBlog) {
                updatedBlog.banner = banner;
            }
            if (title && updatedBlog) {
                const blog_id = generateBlogId(title);
                updatedBlog.blog_id = blog_id;
                updatedBlog.title = title;

            }
            if (tags?.length > 0 && tags?.length <= 5 && updatedBlog) {
                tags = tags.map(tag => tag.toLowerCase());
                updatedBlog.tags = tags;
            } else (
                new ErrorHandler("Tags are required", 400)

            )
            if (draft && updatedBlog) {
                updatedBlog.draft = Boolean(draft);
            }
            if (isPublished && updatedBlog) {
                updatedBlog.isPublished = Boolean(isPublished);
            }
            if (content?.length > 0 && updatedBlog) {
                updatedBlog.content = content;
            }
            if (des?.length > 0 && updatedBlog) {
                updatedBlog.des = des;
            }
            await updatedBlog.save();


            if (updatedBlog) {


                // Optimize finding user and updating
                const incrementVal = updatedBlog.draft ? 0 : 1;

                const user = await userModel.findByIdAndUpdate({ _id: authorId }, { $inc: { "account_info.total_posts": incrementVal }, $push: { blogs: updatedBlog._id } });

                await redis.set(authorId, JSON.stringify(user));
                res.status(200).json({
                    success: true,
                    message: "Blog updated successfully",
                    id: updatedBlog.blog_id,
                });
            }


        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    }
);

// get single blog that blog.isPublished true 
export const getSingleBlog = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id;
            // implement redis caching logic

            const cachedBlog = await redis.get(id);
            if (cachedBlog) {
                const blog = JSON.parse(cachedBlog);
                return res.status(201).json({
                    success: true,
                    message: "Blog found",
                    blog,
                });
            } else {
                const blog = await BlogModel.findOne({ _id: id, isPublished: true, draft: false });
                if (!blog?.isPublished && !blog?.draft) {
                    return next(new ErrorHandler(`Blog not found the blog is removed by the author:${blog?.author} `, 404));
                }
                if (!blog) return next(new ErrorHandler(`Blog not found `, 404));
                // with 1dys to expire and refresh
                await redis.set(id, JSON.stringify(blog), "EX", 86400);

                res.status(200).json({
                    success: true,
                    message: "Blog found",
                    blog,
                });
            }

        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    }
)

// get all blogs where blog.isPublished true and blog.draft false 
export const getAllBlogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // caching with redis strategy
            const cachedBlogs = await redis.get("allBlogs");
            if (cachedBlogs) {
                const blogs = JSON.parse(cachedBlogs);
                return res.status(201).json({
                    success: true,
                    message: "Blogs found",
                    blogs,
                });
            } else {

                const allBlogs = await BlogModel.find({
                    isPublished: true, draft:
                        false
                });
                // add to cache with 1 day to expire 
                await redis.set("allBlogs", JSON.stringify(allBlogs), "EX", 86400);
                res.status(200).json({
                    success: true,
                    message: "Blogs found",
                    data: allBlogs,
                });

            }
        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })
// get all draft of the author 
export const getDraftBlogs = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = req.user?._id;
            const allBlogsDraft = await BlogModel.find({ author: user, draft: true });
            if (!allBlogsDraft.length) {
                return next(new ErrorHandler(`No Draft blogs  found writing by the  author:${user} `, 404));

            }
            res.status(200).json({
                success: true,
                message: "Blogs found",
                allBlogsDraft,
            });



        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    }
)

// single draft writing by the author
export const getSingleDraftBlog = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const user = req.user?._id;
            const id = req.params.id;
            const blog = await BlogModel.findOne({ author: user, _id: id, draft: true });
            if (!blog) {
                return next(new ErrorHandler(`No Draft blog found writing by the  author:${user} `, 404))
            }
            if (blog.isPublished || !blog.draft) {
                return next(new ErrorHandler(`the blog is not draft removed from published format before to get access  in draft format by the author:${blog?.author} `, 404));
            }

            res.status(200).json({
                success: true,
                message: "Blog found",
                blog,
            });

        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })
// add question in blog 
interface IAddQuestionData {
    question: string;
    blogId: string;
}

export const addQuestion = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { question, blogId } = req.body as IAddQuestionData;
            const user = req.user;
            const blog = await BlogModel.findById(blogId);
            if (!user) {
                return next(new ErrorHandler("user not logging", 404));
            }
            const userId = user._id;

            if (!mongoose.Types.ObjectId.isValid(blogId)) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!question || question.length < 5 || question.length > 200) {
                return next(new ErrorHandler(`Question is required and must be between 5 and 200 characters`, 400));
            }

            const newQuestion: any = {
                userId,
                question,
                questionReplies: []
            };

            blog.questions.push(newQuestion);
            // incriment by 1 nombre of total comments and totalParentComment
            blog.activity.total_comments++;
            blog.activity.total_parent_comments++;
            await blog.save();
            // create notification 
            await NotificationModel.create({
                user: userId,
                title: `New Question Received in ${blog.title} `,
                message: `You have a new question in ${blog.title} blog by ${user.username} please check it out`,
            });
            res.status(201).json({
                success: true,
                message: "Question added",
                blog,
            });


        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    }
)

// add answer to blog question 
interface IAddAnswerData {
    answer: string;
    blogId: string;
    questionId: string;
}
export const addAnswer = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { answer, blogId, questionId } = req.body as IAddAnswerData;
            const user = req.user;

            if (!user) {
                return next(new ErrorHandler("user not logging", 404));
            }
            const blog = await BlogModel.findById(blogId);
            if (!mongoose.Types.ObjectId.isValid(blogId)) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!answer || answer.length > 200) {
                return next(new ErrorHandler(`Answer must be under 200 characters `, 400));
            }
            if (!questionId) {
                return next(new ErrorHandler(`Question id is required to be replied`, 400));
            }
            const question = blog.questions?.find((item: any) => item._id.equals(questionId));
            if (!question) {
                return next(new ErrorHandler(`Question not found`, 404));
            }
            console.log(question)
            const userId = user._id;
            const newAnswer: any = {
                userId,
                answer,
            };


            if (userId === question.user) {
                question.questionReplies.push(newAnswer);
                // incriment by 1 nombre of total comments
                blog.activity.total_comments++;
                await blog.save();
                // create notification
                await NotificationModel.create({
                    user: question.user,
                    title: `New Answer Received in ${blog.title} `,
                    message: `You have a new answer in ${blog.title} blog by ${user.username} please check it out`,

                })


                res.status(201).json({
                    success: true,
                    message: "Answer added and notification sent",
                    blog,
                })

            } else {
                // send email to user for new answer 
                question.questionReplies.push(newAnswer);
                // incriment by 1 nombre of total comments
                blog.activity.total_comments++;
                await blog.save();

                const data = {
                    name: user.name,
                    title: blog.title,
                    email: user.email,

                }
                const html = await ejs.renderFile(path.join(__dirname, "../mails/question-reply.ejs"), data)
                try {
                    await sendMail({
                        email: user.email,
                        subject: "New Answer",
                        template: "question-reply.ejs",
                        data,
                    })
                    res.status(201).json({
                        success: true,
                        message: "Answer added and email sent",
                        blog,
                    })
                } catch (error: any) {
                    return next(new ErrorHandler(error.message, 500));
                }

            }

        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })

// add reviews in blog 
interface IAddReviewData {
    review: string;
    blogId: string;
    rating: number;
    userId: string;
}

export const addReview = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const blogId = req.params.id
            const user = req.user

            if (!user) {
                return next(new ErrorHandler("user not logging", 404));
            }

            if (!mongoose.Types.ObjectId.isValid(blogId)) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            const blog = await BlogModel.findById(blogId)
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            const { review, rating } = req.body as IAddReviewData
            if (!review || review.length > 200) {
                return next(new ErrorHandler(`Review must be under 200 characters `, 400));
            }
            if (!rating || rating < 1 || rating > 5) {
                return next(new ErrorHandler(`Rating must be between 1 and 5 `, 400));
            }
            const userId = user._id;
            const reviewData: any = {
                user: userId,
                comment: review,
                rating,
            }
            blog.reviews.push(reviewData)
            if (!blog.reviews) {
                return next(new ErrorHandler(`No review found for ${blog.title} to calculate the rating`, 404));
            }
            if (blog.reviews.length > 0) {
                let avg = 0

                blog.reviews.forEach((review: any) => {
                    avg += review.rating
                })
                avg = avg / blog.reviews.length
                blog.ratings = avg

            }
            await blog.save();

            // create notification 
            await NotificationModel.create({
                user: user._id,
                title: `New Review Received in ${blog.title} `,
                message: `You have a new review in ${blog.title} blog by ${user.username} the blog rating now is ${blog.ratings}`,
            })

            res.status(201).json({
                success: true,
                message: "Review added",
                blog,
            })



        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })

// add replies to review 
interface IAddReviewReplyData {
    comment: string;
    blogId: string;
    reviewId: string;
}

export const addReviewReply = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { comment, blogId, reviewId } = req.body as IAddReviewReplyData
            const user = req.user
            if (!comment || comment.length > 200) {
                return next(new ErrorHandler(`Comment must be under 200 characters `, 400));
            }
            if (!user) {
                return next(new ErrorHandler("user not logging", 404));
            }
            if (user.role === "user") {
                return next(new ErrorHandler(`You are not the author of this blog only author of the blog can give reply to review`, 404));
            }


            const blog = await BlogModel.findById(blogId)
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }

            if (user._id !== blog.author.toString()) {
                return next(new ErrorHandler(`You are  not the author of this blog only author of the blog can give reply to review`, 404));
            }

            const review = blog.reviews?.find((item: any) => item._id.equals(reviewId));
            if (!review) {
                return next(new ErrorHandler(`Review not found`, 404));
            }

            if (user._id === blog.author.toString() && user.role === ("author" || "admin")) {


                const replyData: any = {
                    user: user._id,
                    comment,
                }
                if (!review.commentReplies) {
                    review.commentReplies = []
                }
                review.commentReplies?.push(replyData)
                await blog.save();
                // notification 
                await NotificationModel.create({
                    user: review.user,
                    title: `Review Reply Received  from ${user.username} the ${user.role} of ${blog.title} `,
                    message: `You have a reply in your review about: ${blog.title} blog by ${user.username} . The ${user.role} of ${blog.title} reply in your review: ${review.comment} . Please check it out`,
                })
                res.status(201).json({
                    success: true,
                    message: "Reply added",
                    blog,
                })
            } else {
                return next(new ErrorHandler(`You are not the author of this blog only author of the blog can give reply to review`, 404));
            }

        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })


export const getAllBlogsOnlyAdmin = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            getAllBlogsService(res)

        } catch (error: any) {
            return next(new ErrorHandler(error.message, 400))
        }
    }
)


















// add read blog 
interface IReadBlog {
    blogId: string;
    readAt: Date;
}

export const addReadBlog = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const blogId = req.params.id
            const user = req?.user;
            const blog = await BlogModel.findById(blogId);

            if (!mongoose.Types.ObjectId.isValid(blogId)) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            const readBlog: any = {
                blogId,
                readAt: new Date()
            };
            // increment by 1 nombre of reads in blog.activity.total_reads
            blog.activity.total_reads++;
            await blog.save();
            if (user) {
                user.account_info.total_reads++;
                await user?.save();
            }

            res.status(201).json({
                success: true,
                message: "Blog read",
                blog,


            });
        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })

// add likes to blog 
interface IAddLike {
    blogId: string;
}
export const addLike = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const blogId = req.params.id
            const user = req.user;
            const blog = await BlogModel.findById(blogId);
            if (!blog) {
                return next(new ErrorHandler(`Blog not found`, 404));
            }
            if (!user) {
                return next(new ErrorHandler(`User not found`, 404));
            }
            if (blog && user) {

                blog.activity.total_likes++;
            }
            await blog.save();

            res.status(201).json({
                success: true,
                message: "Blog liked",
                blog,
            });
        } catch (error: any) {
            next(new ErrorHandler(error.message, 500));
        }
    })

