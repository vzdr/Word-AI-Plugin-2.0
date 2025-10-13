/**
 * Query Route for Word AI Plugin Backend
 *
 * POST /api/query endpoint with:
 * - Request validation with express-validator
 * - Rate limiting integration
 * - Cache integration
 * - OpenAI service integration
 * - Comprehensive error handling
 * - Retry logic with exponential backoff
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler, ValidationError } from '../middleware/apiErrorHandler';
import { aiQueryCache, generateCacheKey } from '../utils/cache';
import { createOpenAIService } from '../services/openai';
import { AIRequest, AIResponse, AIModel, AIServiceError, AIErrorType } from '../types/ai';
import { config } from '../config/env';

const router = Router();

/**
 * Allowed AI models
 */
const ALLOWED_MODELS = [
  AIModel.GPT_3_5_TURBO,
  AIModel.GPT_3_5_TURBO_16K,
  AIModel.GPT_4,
  AIModel.GPT_4_TURBO,
  AIModel.GPT_4_32K,
];

/**
 * Validation rules for POST /api/query
 */
const queryValidationRules = [
  body('question')
    .notEmpty()
    .withMessage('Question is required')
    .isString()
    .withMessage('Question must be a string')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Question must be between 1 and 1000 characters'),

  body('contextFiles')
    .optional()
    .isArray({ max: 10 })
    .withMessage('contextFiles must be an array with maximum 10 items')
    .custom((value) => {
      if (value && !Array.isArray(value)) return false;
      if (value && value.length > 0) {
        return value.every((item: any) => typeof item === 'string');
      }
      return true;
    })
    .withMessage('All contextFiles must be strings'),

  body('inlineContext')
    .optional()
    .isString()
    .withMessage('inlineContext must be a string')
    .isLength({ max: 5000 })
    .withMessage('inlineContext must not exceed 5000 characters'),

  body('settings')
    .notEmpty()
    .withMessage('Settings are required')
    .isObject()
    .withMessage('Settings must be an object'),

  body('settings.model')
    .notEmpty()
    .withMessage('Model is required in settings')
    .isString()
    .withMessage('Model must be a string')
    .isIn(ALLOWED_MODELS)
    .withMessage(`Model must be one of: ${ALLOWED_MODELS.join(', ')}`),

  body('settings.temperature')
    .notEmpty()
    .withMessage('Temperature is required in settings')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Temperature must be a number between 0 and 1'),

  body('settings.maxTokens')
    .notEmpty()
    .withMessage('maxTokens is required in settings')
    .isInt({ min: 100, max: 4000 })
    .withMessage('maxTokens must be an integer between 100 and 4000'),
];

/**
 * Validate request and throw ValidationError if invalid
 */
function validateRequest(req: Request): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', {
      errors: errors.array(),
    });
  }
}

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on validation errors or non-retryable errors
      if (error instanceof AIServiceError) {
        const nonRetryableErrors = [
          AIErrorType.INVALID_REQUEST,
          AIErrorType.AUTHENTICATION,
          AIErrorType.INVALID_MODEL,
          AIErrorType.CONTEXT_TOO_LARGE,
        ];

        if (nonRetryableErrors.includes(error.type)) {
          throw error;
        }
      }

      // Don't retry on validation errors
      if (error instanceof ValidationError) {
        throw error;
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        break;
      }

      // Wait before retrying with exponential backoff
      console.log(`[Query] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff with max delay of 10 seconds
      delay = Math.min(delay * 2, 10000);
    }
  }

  // If we get here, all retries failed
  throw lastError || new Error('All retry attempts failed');
}

/**
 * POST /api/query
 *
 * Process AI query with context and return answer with sources
 */
router.post(
  '/',
  aiRateLimiter,
  queryValidationRules,
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const startTime = Date.now();

    // Validate request body
    validateRequest(req);

    // Extract request data
    const { question, contextFiles = [], inlineContext = '', settings } = req.body;

    // Generate cache key
    const cacheKey = generateCacheKey({
      question,
      context: contextFiles,
      settings,
    });

    // Check cache first
    const cachedResponse = aiQueryCache.get(cacheKey) as AIResponse | undefined;
    if (cachedResponse) {
      console.log('[Query] Cache hit for query');
      return res.json({
        ...cachedResponse,
        cached: true,
        responseTime: (Date.now() - startTime) / 1000,
      });
    }

    console.log('[Query] Cache miss, processing with OpenAI');

    // Build AI request
    const aiRequest: AIRequest = {
      question,
      contextFiles,
      inlineContext,
      settings,
    };

    // Initialize OpenAI service
    const openAIService = createOpenAIService(config.openai.apiKey, {
      organizationId: config.openai.orgId,
      timeout: config.openai.requestTimeout,
      maxRetries: 0, // We handle retries ourselves
    });

    // Process request with retry logic
    let aiResponse: AIResponse;
    try {
      aiResponse = await retryWithBackoff(
        async () => await openAIService.processRequest(aiRequest),
        config.openai.maxRetries,
        1000 // Initial delay of 1 second
      );
    } catch (error: any) {
      // Log error details
      console.error('[Query] Error processing request:', {
        error: error.message,
        type: error.type || 'unknown',
        statusCode: error.statusCode,
      });

      // Re-throw to be handled by error middleware
      throw error;
    }

    // Store in cache
    aiQueryCache.set(cacheKey, aiResponse);

    // Return response
    return res.json({
      ...aiResponse,
      cached: false,
    });
  })
);

/**
 * GET /api/query/models
 *
 * Get list of available AI models
 */
router.get(
  '/models',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    return res.json({
      models: ALLOWED_MODELS,
      default: config.openai.defaultModel,
    });
  })
);

/**
 * GET /api/query/settings
 *
 * Get default AI settings
 */
router.get(
  '/settings',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    return res.json({
      defaultModel: config.openai.defaultModel,
      defaultTemperature: config.openai.defaultTemperature,
      defaultMaxTokens: config.openai.defaultMaxTokens,
      allowedModels: ALLOWED_MODELS,
      limits: {
        questionMaxLength: 1000,
        inlineContextMaxLength: 5000,
        maxContextFiles: 10,
        temperatureRange: { min: 0, max: 1 },
        maxTokensRange: { min: 100, max: 4000 },
      },
    });
  })
);

/**
 * GET /api/query/cache/stats
 *
 * Get cache statistics
 */
router.get(
  '/cache/stats',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const stats = aiQueryCache.getStats();
    return res.json({
      cache: stats,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/query/cache
 *
 * Clear cache
 */
router.delete(
  '/cache',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    aiQueryCache.clear();
    return res.json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/query/health
 *
 * Health check for query endpoint
 */
router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    // Test OpenAI connection
    let openaiStatus = 'unknown';
    let openaiError = null;

    try {
      const service = createOpenAIService(config.openai.apiKey, {
        timeout: 5000,
      });
      await service.testConnection();
      openaiStatus = 'healthy';
    } catch (error: any) {
      openaiStatus = 'unhealthy';
      openaiError = error.message;
    }

    // Get cache stats
    const cacheStats = aiQueryCache.getStats();

    return res.json({
      status: openaiStatus === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        openai: {
          status: openaiStatus,
          error: openaiError,
        },
        cache: {
          status: 'healthy',
          size: cacheStats.size,
          hitRate: cacheStats.hitRate,
        },
      },
    });
  })
);

export default router;
