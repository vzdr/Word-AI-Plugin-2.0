/**
 * Health Check Endpoint for Word AI Plugin Backend
 *
 * Provides a simple endpoint to verify the server is running
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * Health check response interface
 */
interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
}

/**
 * GET /api/health
 *
 * Returns server health status, version, and uptime
 *
 * @returns {HealthCheckResponse} Health check information
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const healthCheck: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };

    res.status(200).json(healthCheck);
  })
);

export default router;
