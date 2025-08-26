// Professional Express.js application setup
require("dotenv").config();
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import { ErrorMiddleware } from './middlewares/error';
import { requestLogger } from './middlewares/requestLogger';
import { apiVersioning } from './middlewares/apiVersioning';
import routes from './routes';
import { swaggerSpec } from './config/swagger.config';
import SecurityManager from './security/SecurityManager';

export const app = express();

// Enhanced security middleware stack
const securityManager = SecurityManager;

// Enhanced Helmet configuration with strict CSP
app.use(securityManager.getHelmetConfig());

// Security monitoring and threat detection
app.use(securityManager.securityMonitor());

// Input sanitization middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = securityManager.sanitizeInput(req.body);
  }
  if (req.query) {
    req.query = securityManager.sanitizeInput(req.query);
  }
  next();
});

// Standard middleware
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

// Swagger Documentation Setup
const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #2c3e50; font-size: 36px; }
    .swagger-ui .scheme-container { background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .swagger-ui .info .description { font-size: 16px; line-height: 1.6; }
  `,
  customSiteTitle: 'KidsClub API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
  }
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
app.get('/api-docs.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Professional route organization
app.use('/', routes);

// unknown route 
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Can't find ${req.originalUrl} on this server!`) as any;
    err.statusCode = 404;
    next(err);
})

app.use(ErrorMiddleware);