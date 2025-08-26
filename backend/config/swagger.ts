import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KidsClub Platform API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for the KidsClub platform - A modern content management and community platform with kids-safe features, advertising system, and real-time interactions.',
      contact: {
        name: 'KidsClub Development Team',
        email: 'dev@kidsclub.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.kidsclub.com' 
          : 'http://localhost:8000',
        description: process.env.NODE_ENV === 'production' 
          ? 'Production server' 
          : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            avatar: { type: 'string' },
            role: { 
              type: 'string', 
              enum: ['user', 'admin', 'moderator', 'author'] 
            },
            isVerified: { type: 'boolean' },
            isPremium: { type: 'boolean' },
            followers: { 
              type: 'array', 
              items: { type: 'string' } 
            },
            following: { 
              type: 'array', 
              items: { type: 'string' } 
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Blog: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            category: { type: 'string' },
            tags: { 
              type: 'array', 
              items: { type: 'string' } 
            },
            thumbnail: { type: 'string' },
            author: { $ref: '#/components/schemas/User' },
            isPublished: { type: 'boolean' },
            isKidsContent: { type: 'boolean' },
            ageRange: {
              type: 'object',
              properties: {
                min: { type: 'number' },
                max: { type: 'number' }
              }
            },
            activity: {
              type: 'object',
              properties: {
                total_views: { type: 'number' },
                total_comments: { type: 'number' },
                total_reactions: { type: 'number' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Comment: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            content: { type: 'string' },
            author: { $ref: '#/components/schemas/User' },
            blogId: { type: 'string' },
            parentId: { type: 'string' },
            depth: { type: 'number' },
            reactions: {
              type: 'object',
              properties: {
                likes: { type: 'array', items: { type: 'string' } },
                dislikes: { type: 'array', items: { type: 'string' } },
                hearts: { type: 'array', items: { type: 'string' } },
                laughs: { type: 'array', items: { type: 'string' } }
              }
            },
            isKidsSafe: { type: 'boolean' },
            isFlagged: { type: 'boolean' },
            replyCount: { type: 'number' },
            totalReactions: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            recipient: { type: 'string' },
            sender: { $ref: '#/components/schemas/User' },
            type: { 
              type: 'string',
              enum: ['like', 'comment', 'follow', 'mention', 'blog_published', 'system']
            },
            title: { type: 'string' },
            message: { type: 'string' },
            isRead: { type: 'boolean' },
            data: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        AdCampaign: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            type: { 
              type: 'string',
              enum: ['sponsored_content', 'banner', 'native', 'video']
            },
            status: { 
              type: 'string',
              enum: ['draft', 'active', 'paused', 'completed']
            },
            budget: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                daily: { type: 'number' },
                spent: { type: 'number' }
              }
            },
            targeting: {
              type: 'object',
              properties: {
                countries: { type: 'array', items: { type: 'string' } },
                languages: { type: 'array', items: { type: 'string' } },
                interests: { type: 'array', items: { type: 'string' } },
                ageRange: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' }
                  }
                }
              }
            },
            performance: {
              type: 'object',
              properties: {
                impressions: { type: 'number' },
                clicks: { type: 'number' },
                conversions: { type: 'number' },
                ctr: { type: 'number' },
                cpm: { type: 'number' },
                cpa: { type: 'number' }
              }
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            statusCode: { type: 'number' }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization endpoints'
      },
      {
        name: 'Users',
        description: 'User management and profile operations'
      },
      {
        name: 'Blogs',
        description: 'Blog content management and operations'
      },
      {
        name: 'Comments',
        description: 'Comment system with nested replies and reactions'
      },
      {
        name: 'Notifications',
        description: 'Real-time notification system'
      },
      {
        name: 'Analytics',
        description: 'Platform and user analytics'
      },
      {
        name: 'Advertising',
        description: 'Ad campaign management and tracking'
      },
      {
        name: 'File Upload',
        description: 'File upload and media management'
      }
    ]
  },
  apis: [
    './routes/*.ts',
    './controllers/*.ts',
    './models/*.ts'
  ]
};

const specs = swaggerJSDoc(options);

export const setupSwagger = (app: Application): void => {
  // Swagger UI options
  const swaggerOptions = {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #2c3e50; }
      .swagger-ui .scheme-container { background: #f8f9fa; padding: 20px; border-radius: 5px; }
    `,
    customSiteTitle: 'KidsClub API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2
    }
  };

  // Serve swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));
  
  // Serve swagger.json
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

export default specs;
