/**
 * The `sendToken` function sends access and refresh tokens as cookies, with options.
 * It also sends response data like success status, user object, and access token.
 *
 * It optimizes token expiration based on environment variables, with fallback values.
 *
 * The access token is set to secure in production for extra security.
 *
 * It also saves the user session to Redis for server-side use.
 */

require("dotenv").config();
import { Response } from "express";
import { IUser } from "../models/user.model";
import { redis } from "./redis";

// token options interface
interface ITokenOptions {
    expires: Date;
    maxAge: number;
    httpOnly: boolean;
    sameSite: "lax" | "strict" | "none" | undefined;
    secure?: boolean;
}

// parse env vars for token expirations
const accessTokenExpire = parseInt(
    process.env.JWT_EXPIRES_IN_ACCESS || "300",
    10
);
const refreshTokenExpire = parseInt(
    process.env.JWT_EXPIRES_IN_REFRESH || "604800",
    10
);

// set token options with expirations
export const accessTokenOptions: ITokenOptions = {
    expires: new Date(Date.now() + accessTokenExpire * 1000),
    maxAge: accessTokenExpire * 1000,
    httpOnly: true,
    sameSite: "lax",
};

export const refreshTokenOptions: ITokenOptions = {
    expires: new Date(Date.now() + refreshTokenExpire * 1000),
    maxAge: refreshTokenExpire * 1000,
    httpOnly: true,
    sameSite: "lax",
};

// send token function
export const sendToken = (user: IUser, statusCode: number, res: Response) => {
    const accessToken = user.SignAccessToken();
    const refreshToken = user.SignRefreshToken();

    // save user session to Redis
    redis.set(user._id as string, JSON.stringify(user));

    // set secure true in production
    if (process.env.NODE_ENV === "production") {
        accessTokenOptions.secure = true;
    }

    res.cookie("access_token", accessToken, accessTokenOptions);
    res.cookie("refresh_token", refreshToken, refreshTokenOptions);

    // send response
    res.status(statusCode).json({
        success: true,
        user,
        accessToken,
    });
};
