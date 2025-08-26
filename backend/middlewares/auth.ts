import jwt, { JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "./catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { redis } from '../utils/redis';


// This middleware is used to check if the user is authenticated or not
export const isAuthenticatedUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
        const accessToken = req.cookies.access_token;
        if (!accessToken) {
            return next(new ErrorHandler("Please login to continue", 400));
        }
        const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN as string) as JwtPayload
        if (!decoded) {
            return next(new ErrorHandler("Access token is not valid", 400));
        }
        const user = await redis.get(decoded.id);
        if (!user) {
            return next(new ErrorHandler("User not found", 400));

        }
        req.user = JSON.parse(user as string);
        next()

    })

/*  validate user Role  :  role: {
        type: String,
        enum: ["admin", "user", "moderator", "author"],
        default: "user",
    }, */
//TODO: fix allowed role to access the resources

// Allowed roles constant
export const authorizeRoles = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!roles.includes(req.user?.role || '')) {
            return next(new ErrorHandler(`role ${req.user?.role} is not allowed to access this resource`, 403))
        }
        next();
    }
}