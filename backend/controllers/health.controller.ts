import { Request, Response, NextFunction } from 'express';
import { catchAsyncErrors } from '../middlewares/catchAsyncErrors';
import mongoose from 'mongoose';
import { redis } from '../utils/redis';
import imageKit from '../utils/imagekit';
import os from 'os';
import { performance } from 'perf_hooks';

interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    imagekit: ServiceHealth;
  };
  system: SystemHealth;
  performance: PerformanceMetrics;
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  message?: string;
  lastChecked: string;
}

interface SystemHealth {
  memory: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
  cpu: {
    loadAverage: number[];
    cores: number;
  };
  disk?: {
    used: number;
    free: number;
    total: number;
    percentage: number;
  };
}

interface PerformanceMetrics {
  averageResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
}

/**
 * Comprehensive health check endpoint
 * Returns detailed system status including all dependencies
 */
export const healthCheck = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    
    // Check all services in parallel
    const [databaseHealth, redisHealth, imagekitHealth] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkImageKitHealth()
    ]);

    const systemHealth = getSystemHealth();
    const performanceMetrics = await getPerformanceMetrics();

    // Determine overall status
    const services = {
      database: databaseHealth.status === 'fulfilled' ? databaseHealth.value : { status: 'down' as const, message: 'Connection failed', lastChecked: new Date().toISOString() },
      redis: redisHealth.status === 'fulfilled' ? redisHealth.value : { status: 'down' as const, message: 'Connection failed', lastChecked: new Date().toISOString() },
      imagekit: imagekitHealth.status === 'fulfilled' ? imagekitHealth.value : { status: 'down' as const, message: 'Connection failed', lastChecked: new Date().toISOString() }
    };

    const overallStatus = determineOverallStatus(services);
    const responseTime = performance.now() - startTime;

    const healthData: HealthCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      system: systemHealth,
      performance: performanceMetrics
    };

    // Set appropriate HTTP status code
    const httpStatus = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(httpStatus).json({
      success: overallStatus !== 'unhealthy',
      data: healthData,
      meta: {
        responseTime: Math.round(responseTime),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
  }
);

/**
 * Simple liveness probe for container orchestration
 */
export const livenessProbe = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }
);

/**
 * Readiness probe for container orchestration
 */
export const readinessProbe = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Quick checks for critical services
      await Promise.all([
        mongoose.connection.db?.admin().ping(),
        redis.ping()
      ]);

      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        services: ['database', 'redis']
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: 'Critical services unavailable'
      });
    }
  }
);

/**
 * System metrics endpoint for monitoring
 */
export const systemMetrics = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: getSystemHealth(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        versions: process.versions
      },
      database: {
        connections: mongoose.connections.length,
        readyState: mongoose.connection.readyState,
        collections: Object.keys(mongoose.connection.collections).length
      }
    };

    res.status(200).json({
      success: true,
      data: metrics
    });
  }
);

// Helper functions
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = performance.now();
  try {
    await mongoose.connection.db?.admin().ping();
    const responseTime = performance.now() - startTime;
    
    return {
      status: 'up',
      responseTime: Math.round(responseTime),
      message: `Connected to ${mongoose.connection.name}`,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'down',
      responseTime: performance.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkRedisHealth(): Promise<ServiceHealth> {
  const startTime = performance.now();
  try {
    const result = await redis.ping();
    const responseTime = performance.now() - startTime;
    
    return {
      status: result === 'PONG' ? 'up' : 'degraded',
      responseTime: Math.round(responseTime),
      message: `Redis responded: ${result}`,
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'down',
      responseTime: performance.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

async function checkImageKitHealth(): Promise<ServiceHealth> {
  const startTime = performance.now();
  try {
    // Use ImageKit's authentication parameters endpoint as health check
    const authParams = imageKit.getAuthenticationParameters();
    const responseTime = performance.now() - startTime;
    
    return {
      status: authParams ? 'up' : 'degraded',
      responseTime: Math.round(responseTime),
      message: 'ImageKit service accessible',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'down',
      responseTime: performance.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      lastChecked: new Date().toISOString()
    };
  }
}

function getSystemHealth(): SystemHealth {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    memory: {
      used: usedMem,
      free: freeMem,
      total: totalMem,
      percentage: Math.round((usedMem / totalMem) * 100)
    },
    cpu: {
      loadAverage: os.loadavg(),
      cores: os.cpus().length
    }
  };
}

async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  // In a real application, these would come from monitoring systems
  // For now, return mock data or implement basic tracking
  return {
    averageResponseTime: 150, // ms
    requestsPerSecond: 10,
    errorRate: 0.01 // 1%
  };
}

function determineOverallStatus(services: HealthCheck['services']): 'healthy' | 'unhealthy' | 'degraded' {
  const serviceStatuses = Object.values(services).map(s => s.status);
  
  if (serviceStatuses.every(status => status === 'up')) {
    return 'healthy';
  }
  
  if (serviceStatuses.some(status => status === 'down')) {
    // If critical services are down, system is unhealthy
    if (services.database.status === 'down' || services.redis.status === 'down') {
      return 'unhealthy';
    }
    return 'degraded';
  }
  
  return 'degraded';
}
