import { userModel } from './models/user.model';
// default import  to my app server 
require("dotenv").config();
import express, { NextFunction, Request, Response } from 'express';
export const app = express();
import { ErrorMiddleware } from './middlewares/error';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import userRouter from './routes/user.route';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import blogRouter from './routes/blog.route';
import notificationRouter from './routes/notification.route';





// set security HTTP headers
app.use(helmet());

// body parser
app.use(express.json({ limit: '50mb' }));

app.use(mongoSanitize());
app.use(compression());
// cookie parser
app.use(cookieParser());

// cors
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));
/* app.use(morgan('dev')) */
//! routes
app.use("/api/v1", userRouter, blogRouter, notificationRouter)


// testing API 



app.get('/test', (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
        success: true,
        message: "Test API is working fine"
    })
})

// unknown route 
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Can't find ${req.originalUrl} on this server!`) as any;
    err.statusCode = 404;
    next(err);
})

app.use(ErrorMiddleware);