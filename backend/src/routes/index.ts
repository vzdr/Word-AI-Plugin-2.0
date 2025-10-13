/**
 * Routes Index for Word AI Plugin Backend
 *
 * Central router that aggregates all API routes
 */

import { Router } from 'express';
import healthRouter from './health';
import parserRouter from './parser';
import queryRouter from './query';

const router = Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.use('/health', healthRouter);

/**
 * File parser endpoint
 * POST /api/parser/parse
 * GET /api/parser/supported
 * POST /api/parser/validate
 */
router.use('/parser', parserRouter);

/**
 * AI Query endpoint
 * POST /api/query
 * GET /api/query/models
 * GET /api/query/settings
 * GET /api/query/cache/stats
 * DELETE /api/query/cache
 * GET /api/query/health
 */
router.use('/query', queryRouter);

/**
 * Future routes will be added here:
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
