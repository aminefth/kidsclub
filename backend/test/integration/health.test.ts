import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { healthCheck, livenessProbe, readinessProbe, systemMetrics } from '../../controllers/health.controller';
import { mockRedis } from '../mocks/redis.mock';
import { mockImageKit } from '../mocks/imagekit.mock';

// Create test app
const app = express();
app.use(express.json());
app.get('/health', healthCheck);
app.get('/health/live', livenessProbe);
app.get('/health/ready', readinessProbe);
app.get('/health/metrics', systemMetrics);

describe('Health Check System', () => {
  describe('GET /health - Comprehensive Health Check', () => {
    it('should return healthy status when all services are up', async () => {
      // Mock successful service responses
      mockRedis.ping.mockResolvedValueOnce('PONG');
      
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/healthy|degraded/),
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: expect.any(String),
          environment: expect.any(String),
          services: {
            database: {
              status: expect.stringMatching(/up|down/),
              lastChecked: expect.any(String)
            },
            redis: {
              status: expect.stringMatching(/up|down/),
              lastChecked: expect.any(String)
            },
            imagekit: {
              status: expect.stringMatching(/up|down/),
              lastChecked: expect.any(String)
            }
          },
          system: {
            memory: {
              used: expect.any(Number),
              free: expect.any(Number),
              total: expect.any(Number),
              percentage: expect.any(Number)
            },
            cpu: {
              loadAverage: expect.any(Array),
              cores: expect.any(Number)
            }
          },
          performance: {
            averageResponseTime: expect.any(Number),
            requestsPerSecond: expect.any(Number),
            errorRate: expect.any(Number)
          }
        },
        meta: {
          responseTime: expect.any(Number)
        }
      });
    });

    it('should return degraded status when Redis is down', async () => {
      // Mock Redis failure
      mockRedis.ping.mockRejectedValueOnce(new Error('Redis connection failed'));

      const response = await request(app)
        .get('/health')
        .expect(200); // Still 200 for degraded state

      expect(response.body.data.status).toBe('degraded');
      expect(response.body.data.services.redis.status).toBe('down');
      expect(response.body.data.services.redis.message).toContain('Redis connection failed');
    });

    it('should return unhealthy status when database is down', async () => {
      // Mock database failure by closing connection
      await mongoose.connection.close();

      const response = await request(app)
        .get('/health')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.data.status).toBe('unhealthy');
      expect(response.body.data.services.database.status).toBe('down');
    });

    it('should include performance metrics', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const { performance } = response.body.data;
      expect(performance).toHaveProperty('averageResponseTime');
      expect(performance).toHaveProperty('requestsPerSecond');
      expect(performance).toHaveProperty('errorRate');
      expect(performance.averageResponseTime).toBeGreaterThan(0);
      expect(performance.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should include system resource information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const { system } = response.body.data;
      expect(system.memory.percentage).toBeGreaterThan(0);
      expect(system.memory.percentage).toBeLessThanOrEqual(100);
      expect(system.cpu.cores).toBeGreaterThan(0);
      expect(Array.isArray(system.cpu.loadAverage)).toBe(true);
      expect(system.cpu.loadAverage).toHaveLength(3);
    });

    it('should handle concurrent health check requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveProperty('timestamp');
        expect(response.body.meta).toHaveProperty('responseTime');
      });
    });
  });

  describe('GET /health/live - Liveness Probe', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should respond quickly for container orchestration', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health/live')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
    });
  });

  describe('GET /health/ready - Readiness Probe', () => {
    it('should return ready status when critical services are available', async () => {
      mockRedis.ping.mockResolvedValueOnce('PONG');

      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String),
        services: expect.arrayContaining(['database', 'redis'])
      });
    });

    it('should return not ready when critical services are down', async () => {
      // Mock Redis failure
      mockRedis.ping.mockRejectedValueOnce(new Error('Redis unavailable'));

      const response = await request(app)
        .get('/health/ready')
        .expect(503);

      expect(response.body).toMatchObject({
        status: 'not_ready',
        timestamp: expect.any(String),
        error: 'Critical services unavailable'
      });
    });

    it('should respond quickly for Kubernetes readiness checks', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health/ready');

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(200); // Should respond within 200ms
    });
  });

  describe('GET /health/metrics - System Metrics', () => {
    it('should return detailed system metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          timestamp: expect.any(String),
          system: {
            memory: expect.objectContaining({
              used: expect.any(Number),
              free: expect.any(Number),
              total: expect.any(Number),
              percentage: expect.any(Number)
            }),
            cpu: expect.objectContaining({
              loadAverage: expect.any(Array),
              cores: expect.any(Number)
            })
          },
          process: {
            pid: expect.any(Number),
            uptime: expect.any(Number),
            memoryUsage: expect.any(Object),
            cpuUsage: expect.any(Object),
            versions: expect.any(Object)
          },
          database: {
            connections: expect.any(Number),
            readyState: expect.any(Number),
            collections: expect.any(Number)
          }
        }
      });
    });

    it('should include Node.js process information', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const { process: processInfo } = response.body.data;
      expect(processInfo.pid).toBe(process.pid);
      expect(processInfo.versions).toHaveProperty('node');
      expect(processInfo.memoryUsage).toHaveProperty('heapUsed');
      expect(processInfo.memoryUsage).toHaveProperty('heapTotal');
    });

    it('should include database connection information', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      const { database } = response.body.data;
      expect(database.readyState).toBeGreaterThanOrEqual(0);
      expect(database.readyState).toBeLessThanOrEqual(3);
      expect(database.connections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health Check Performance', () => {
    it('should complete health check within acceptable time', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle multiple concurrent health checks efficiently', async () => {
      const concurrentRequests = 50;
      const startTime = Date.now();
      
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Average response time should be reasonable
      const avgResponseTime = totalTime / concurrentRequests;
      expect(avgResponseTime).toBeLessThan(500); // Average under 500ms
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await request(app)
        .get('/health')
        .set('Content-Type', 'application/json')
        .send('invalid-json');

      expect(response.status).toBeLessThan(500);
    });

    it('should not expose sensitive information in error responses', async () => {
      // Force an error condition
      const originalConsoleError = console.error;
      console.error = jest.fn();

      const response = await request(app)
        .get('/health');

      // Should not contain sensitive data like connection strings, tokens, etc.
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toMatch(/password|token|secret|key/i);

      console.error = originalConsoleError;
    });
  });
});
