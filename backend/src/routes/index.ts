/**
 * Routes Index for Word AI Plugin Backend
 *
 * Central router that aggregates all API routes
 */

import { Router } from 'express';
import healthRouter from './health';

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.use('/health', healthRouter);

/**
 * Future routes will be added here:
 *
 * AI Query endpoint
 * POST /api/query
 * router.use('/query', queryRouter);
 *
 * File upload endpoint
 * POST /api/upload
 * router.use('/upload', uploadRouter);
 *
 * Table generation endpoint
 * POST /api/table/generate
 * router.use('/table', tableRouter);
 */

export default router;
