import ErrorHandler from "../utils/ErrorHandler";
import { NextFunction, Request, Response } from "express";

export const ErrorMiddleware = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || "Internal Server Error";

    //wrong mongodb id error
    if (err.name === "CastError") {
        const message = `Resource not found. Invalid: ${err.path}`;
        err = new ErrorHandler(message, 400);
    }
    //duplicate key error
    if (err.code === 11000) {
        const message = `Duplicate field value entered: ${Object.keys(
            err.keyValue
        )}`;
        err = new ErrorHandler(message, 400);
    }
    //validation error
    if (err.name === "ValidationError") {
        const errors = Object.values(err.errors).map(
            (el: any) => el.properties.message
        );
        const message = `Validation error. ${errors.join(". ")}`;
        err = new ErrorHandler(message, 400);
    }
    // wrong jwt error
    if (err.name === "JsonWebTokenError") {
        const message = `Invalid token. Please login again!`;
        err = new ErrorHandler(message, 400);
    }

    // jwt expire error
    if (err.name === "TokenExpiredError") {
        const message = `Your token has expired. Please login again!`;
        err = new ErrorHandler(message, 401);
    }

    // response err
    res.status(err.statusCode).json({
        success: false,
        error: err.statusCode,
        message: err.message,
    });
};
