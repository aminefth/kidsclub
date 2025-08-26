# KidsClub Backend API

Professional Node.js/TypeScript backend with comprehensive health monitoring and enterprise-grade architecture.

## 🚀 Features

### Core Architecture
- **Node.js + TypeScript** - Type-safe development
- **Express.js** - Professional web framework
- **MongoDB + Mongoose** - Document database with ODM
- **Redis** - Session management and caching
- **JWT Authentication** - Secure token-based auth with refresh tokens
- **ImageKit Integration** - Image optimization and storage

### Professional API Structure
- **Health Check System** - Comprehensive monitoring endpoints
- **API Versioning** - Professional versioning middleware
- **Request Logging** - Detailed request/response tracking
- **Rate Limiting** - Protection against abuse
- **Security Middleware** - Helmet, CORS, sanitization
- **Error Handling** - Centralized error management

### Health Check Endpoints

#### `/health` - Comprehensive Health Check
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-08-26T21:22:47.592Z",
    "uptime": 46.104561402,
    "version": "1.0.0",
    "environment": "development",
    "services": {
      "database": {
        "status": "up",
        "responseTime": 68,
        "message": "Connected to kidsclub",
        "lastChecked": "2025-08-26T21:22:47.210Z"
      },
      "redis": {
        "status": "up",
        "responseTime": 449,
        "message": "Redis responded: PONG",
        "lastChecked": "2025-08-26T21:22:47.591Z"
      },
      "imagekit": {
        "status": "up",
        "responseTime": 0,
        "message": "ImageKit service accessible",
        "lastChecked": "2025-08-26T21:22:47.142Z"
      }
    },
    "system": {
      "memory": {
        "used": 10746306560,
        "free": 5755756544,
        "total": 16502063104,
        "percentage": 65
      },
      "cpu": {
        "loadAverage": [2.62, 2.51, 1.81],
        "cores": 8
      }
    },
    "performance": {
      "averageResponseTime": 150,
      "requestsPerSecond": 10,
      "errorRate": 0.01
    }
  },
  "meta": {
    "responseTime": 451,
    "requestId": "180ac574-fa39-48d1-b203-c24b0189610c"
  }
}
```

#### `/health/live` - Kubernetes Liveness Probe
Simple alive check for container orchestration.

#### `/health/ready` - Kubernetes Readiness Probe  
```json
{
  "status": "ready",
  "timestamp": "2025-08-26T21:23:05.576Z",
  "services": ["database", "redis"]
}
```

#### `/health/metrics` - System Metrics (Protected)
Detailed system metrics for monitoring dashboards.

### API Endpoints Structure

```
/api                    - API status and documentation
/health                 - Comprehensive health check
/health/live           - Liveness probe
/health/ready          - Readiness probe
/health/metrics        - System metrics (protected)

/api/v1/               - Version 1 API routes
├── auth/              - Authentication endpoints
├── blogs/             - Blog management
├── comments/          - Comment system
├── notifications/     - Real-time notifications
├── ads/               - Advertising system
└── analytics/         - Analytics and metrics
```

## 🛠 Development

### Prerequisites
- Node.js 18+
- MongoDB Atlas account
- Redis (Upstash)
- ImageKit account

### Environment Variables
```env
# Database
MONGODB_URL=your_mongodb_connection_string

# Redis
REDIS_URL=your_redis_url

# JWT Secrets
ACCESS_TOKEN=your_access_token_secret
REFRESH_TOKEN=your_refresh_token_secret

# ImageKit
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint

# Server
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### Installation & Setup
```bash
# Install dependencies (using pnpm)
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start
```

### Professional Middleware Stack
1. **Helmet** - Security headers
2. **CORS** - Cross-origin resource sharing
3. **Request Logger** - Professional request tracking
4. **API Versioning** - Version management
5. **Rate Limiting** - Abuse protection
6. **Authentication** - JWT-based auth
7. **Error Handling** - Centralized error management

## 🏗 Architecture Highlights

### Enterprise-Grade Features
- **Health Monitoring** - Multi-service health checks
- **Request Tracing** - UUID-based request tracking
- **Performance Metrics** - Response time and system monitoring
- **Graceful Error Handling** - Professional error responses
- **Security Best Practices** - Comprehensive security middleware
- **Scalable Structure** - Modular, maintainable codebase

### Monitoring & Observability
- Real-time health status monitoring
- System resource tracking (CPU, memory)
- Service dependency health checks
- Request/response logging with correlation IDs
- Performance metrics collection

### Production Ready
- Container orchestration support (K8s probes)
- Environment-based configuration
- Professional error handling
- Security hardening
- Performance optimization

## 📊 Health Check Status Codes
- **200** - Healthy/Ready
- **503** - Unhealthy/Not Ready
- **400** - Invalid API version

## 🔒 Security Features
- JWT authentication with refresh tokens
- Rate limiting per endpoint
- Input sanitization
- CORS configuration
- Security headers (Helmet)
- MongoDB injection protection

---

Built with 20+ years of Express.js expertise and enterprise-grade architecture patterns.
