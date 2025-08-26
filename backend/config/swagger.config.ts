import swaggerJSDoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'KidsClub API',
    version: '1.0.0',
    description: `
# KidsClub Platform API

A comprehensive content management and social platform designed for family-friendly content with advanced moderation, analytics, and monetization features.

## Features
- 🔐 **JWT Authentication** with refresh tokens
- 👥 **User Management** with role-based access control
- 📝 **Content Management** with draft/publish workflow
- 💬 **Comment System** with nested threading and reactions
- 📊 **Analytics** with real-time tracking
- 💰 **Advertising** with campaign management
- 🔔 **Real-time Notifications** via WebSocket
- 🖼️ **Image Management** with ImageKit integration
- 👶 **Kids Safety** with content filtering and moderation

## Authentication
Most endpoints require authentication via JWT tokens. Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting
API endpoints are rate-limited to ensure fair usage and system stability.

## Error Handling
All errors follow a consistent format with appropriate HTTP status codes and descriptive messages.
    `,
    contact: {
      name: 'KidsClub API Support',
      email: 'support@kidsclub.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Development server',
    },
    {
      url: 'https://api.kidsclub.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token obtained from login endpoint',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
        description: 'JWT token stored in HTTP-only cookie',
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication information is missing or invalid',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Authentication required' },
                error: { type: 'string', example: 'UNAUTHORIZED' },
              },
            },
          },
        },
      },
      ForbiddenError: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Insufficient permissions' },
                error: { type: 'string', example: 'FORBIDDEN' },
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Resource not found' },
                error: { type: 'string', example: 'NOT_FOUND' },
              },
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Validation failed' },
                error: { type: 'string', example: 'VALIDATION_ERROR' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                      code: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Internal server error' },
                error: { type: 'string', example: 'INTERNAL_ERROR' },
              },
            },
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: 'Health',
      description: 'System health and monitoring endpoints',
    },
    {
      name: 'Authentication',
      description: 'User authentication and authorization',
    },
    {
      name: 'Users',
      description: 'User management and profile operations',
    },
    {
      name: 'Blogs',
      description: 'Content creation and management',
    },
    {
      name: 'Comments',
      description: 'Comment system with threading and reactions',
    },
    {
      name: 'Analytics',
      description: 'Usage analytics and performance metrics',
    },
    {
      name: 'Advertising',
      description: 'Ad campaign management and revenue tracking',
    },
    {
      name: 'Notifications',
      description: 'Real-time notification system',
    },
    {
      name: 'Admin',
      description: 'Administrative operations (admin only)',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: [
    './routes/*.ts',
    './controllers/*.ts',
    './models/*.ts',
    './docs/schemas/*.yaml',
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec;
