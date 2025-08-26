import express from 'express';
import { healthCheck } from '../controllers/health.controller';

const router = express.Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: System health check
 *     description: |
 *       Comprehensive health check endpoint that monitors all system components:
 *       - Database connectivity (MongoDB)
 *       - Redis cache connectivity
 *       - ImageKit service availability
 *       - System resources (memory, CPU)
 *       - Performance metrics
 *       
 *       **Use Cases:**
 *       - Load balancer health checks
 *       - Monitoring and alerting systems
 *       - Development debugging
 *       - System status dashboards
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthCheck'
 *             examples:
 *               healthy:
 *                 summary: All systems operational
 *                 value:
 *                   success: true
 *                   data:
 *                     status: "healthy"
 *                     timestamp: "2025-08-26T21:50:13.608Z"
 *                     uptime: 29.279138574
 *                     version: "1.0.0"
 *                     environment: "development"
 *                     services:
 *                       database:
 *                         status: "up"
 *                         responseTime: 95
 *                         message: "Connected to kidsclub"
 *                         lastChecked: "2025-08-26T21:50:13.110Z"
 *                       redis:
 *                         status: "up"
 *                         responseTime: 587
 *                         message: "Redis responded: PONG"
 *                         lastChecked: "2025-08-26T21:50:13.603Z"
 *                       imagekit:
 *                         status: "up"
 *                         responseTime: 0
 *                         message: "ImageKit service accessible"
 *                         lastChecked: "2025-08-26T21:50:13.016Z"
 *                     system:
 *                       memory:
 *                         used: 11260256256
 *                         free: 5241806848
 *                         total: 16502063104
 *                         percentage: 68
 *                       cpu:
 *                         loadAverage: [3.62, 3.31, 2.82]
 *                         cores: 8
 *                     performance:
 *                       averageResponseTime: 150
 *                       requestsPerSecond: 10
 *                       errorRate: 0.01
 *                   meta:
 *                     responseTime: 594
 *                     requestId: "c502cb80-1098-4b74-bac1-accaf7395eb3"
 *       503:
 *         description: System is unhealthy or degraded
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthCheck'
 *             examples:
 *               unhealthy:
 *                 summary: System degraded
 *                 value:
 *                   success: false
 *                   message: "System health check failed"
 *                   error: "SYSTEM_UNHEALTHY"
 *                   data:
 *                     status: "degraded"
 *                     timestamp: "2025-08-26T21:50:13.608Z"
 *                     services:
 *                       database:
 *                         status: "down"
 *                         responseTime: 0
 *                         message: "Connection timeout"
 *                         lastChecked: "2025-08-26T21:50:13.110Z"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *     security: []
 */
router.get('/health', healthCheck);

/**
 * @swagger
 * /api/v1/ping:
 *   get:
 *     tags: [Health]
 *     summary: Simple ping endpoint
 *     description: |
 *       Lightweight endpoint for basic connectivity testing.
 *       Returns minimal response for load balancer checks.
 *     responses:
 *       200:
 *         description: Service is responding
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-08-26T21:50:13.608Z"
 *             example:
 *               status: "ok"
 *               timestamp: "2025-08-26T21:50:13.608Z"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 *     security: []
 */
router.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

export default router;
