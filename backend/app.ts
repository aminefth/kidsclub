import { userModel } from './models/user.model';
// Professional Express.js application setup
require("dotenv").config();
import express, { NextFunction, Request, Response } from 'express';
export const app = express();
import { ErrorMiddleware } from './middlewares/error';
import { requestLogger, errorLogger } from './middlewares/requestLogger';
import { apiVersioning } from './middlewares/apiVersioning';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import imageKit from './utils/imagekit';
import { setupSwagger } from './config/swagger';
import routes from './routes';





// Professional middleware stack
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(mongoSanitize());
app.use(compression());
app.use(cookieParser());

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));

// Professional logging and monitoring
app.use(requestLogger);
app.use(apiVersioning);

// Setup Swagger documentation
setupSwagger(app);

// Professional route organization
app.use('/', routes);

// Legacy test endpoint (will be moved to health checks)
app.get('/test', (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
        success: true,
        message: "KidsClub API is operational",
        version: "1.0.0",
        timestamp: new Date().toISOString()
    });
});

// unknown route 
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Can't find ${req.originalUrl} on this server!`) as any;
    err.statusCode = 404;
    next(err);
})

app.use(ErrorMiddleware);