import express from 'express';
import {
  healthCheck,
  livenessProbe,
  readinessProbe,
  systemMetrics
} from '../controllers/health.controller';
import { authLimiter } from '../middlewares/rateLimite';

const router = express.Router();

/**
 * Health Check Routes
 * These endpoints are used for monitoring, alerting, and container orchestration
 */

// Comprehensive health check - includes all services and system metrics
router.get('/health', healthCheck);

// Kubernetes/Docker liveness probe - simple alive check
router.get('/health/live', livenessProbe);

// Kubernetes/Docker readiness probe - ready to serve traffic
router.get('/health/ready', readinessProbe);

// System metrics for monitoring dashboards (protected)
router.get('/health/metrics', authLimiter, systemMetrics);

export default router;
