import BlogModel from "../models/blogs.model"
import { Response } from "express"
export const getAllBlogsService = async (res: Response) => {
    const Blogs = await BlogModel.find().sort({ createdAt: -1 }).lean()

    res.status(200).json({
        success: true,
        Blogs
    })
}
