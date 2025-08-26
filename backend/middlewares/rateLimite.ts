import rateLimit from "express-rate-limit";
require("dotenv").config();


interface RateLimitConfig {
    windowMs: number;
    max: number;
    skipSuccessfulRequests: boolean;
    standardHeaders: boolean;
    legacyHeaders: boolean;
}

const getRateLimitConfig = (): RateLimitConfig => {
    return {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "15 * 60 * 1000", 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
        skipSuccessfulRequests: true,
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false,
    };
}

export const authLimiter = rateLimit(getRateLimitConfig());