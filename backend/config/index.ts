require("dotenv").config();
import merge from "lodash.merge";
// make sure NODE_ENV is set
process.env.NODE_ENV = process.env.NODE_ENV || "development";

// create stages for the server local production testing
const stage = process.env.STAGE || "local";

let envConfig;

if (stage === "production") {
    envConfig = require("./prod").default;
} else if (stage === "testing") {
    envConfig = require("./testing").default;
} else {
    envConfig = require("./local").default;
}
// Use DB_URL_ATLAS if available, otherwise fallback to DB_URL (for development)
const dbUrl = process.env.NODE_ENV === 'development' 
    ? process.env.DB_URL_ATLAS || process.env.DB_URL 
    : process.env.DB_URL_ATLAS;

if (!dbUrl) {
    console.warn('Warning: No database URL configured. Please set either DB_URL_ATLAS or DB_URL in your environment variables.');
}

export default merge({
    stage,
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    dbUrl,
    imagekit: {
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    },
    redisUrl: process.env.REDIS_URL,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpMail: process.env.SMTP_MAIL,
    smtpPassword: process.env.SMTP_PASSWORD,
    secret: {
        jwt: process.env.ACCESS_TOKEN,
        jwtExp: process.env.JWT_EXPIRES_IN_ACCESS,
        jwtRefreshExp: process.env.JWT_EXPIRES_IN_REFRESH,
        jwtRefreshSecret: process.env.REFRESH_TOKEN,
        jwtAccessSecret: process.env.ACCESS_TOKEN,
    },
});
