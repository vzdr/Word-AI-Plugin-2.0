import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import {
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  burstRateLimit,
  aiQueryRateLimit,
  defaultRateLimit,
  rateLimitStats,
  RateLimitConfig,
} from '../config/rateLimits';

/**
 * Rate Limiter Strategy Types
 */
export enum RateLimitStrategy {
  USER = 'user',
  IP = 'ip',
  GLOBAL = 'global',
  BURST = 'burst',
  AI_QUERY = 'ai_query',
  DEFAULT = 'default',
}

/**
 * Custom key generator for user-based rate limiting
 * Uses user ID from authentication or falls back to IP
 */
const userKeyGenerator = (req: Request): string => {
  // Check for user ID in request (set by auth middleware)
  const userId = (req as any).user?.id || (req as any).userId;
  if (userId) {
    rateLimitStats.recordRequest(`user:${userId}`);
    return `user:${userId}`;
  }

  // Fallback to IP address
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  rateLimitStats.recordRequest(`ip:${ip}`);
  return `ip:${ip}`;
};

/**
 * IP-based key generator
 */
const ipKeyGenerator = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  rateLimitStats.recordRequest(`ip:${ip}`);
  return `ip:${ip}`;
};

/**
 * Global key generator (applies to all requests)
 */
const globalKeyGenerator = (): string => {
  return 'global';
};

/**
 * Extended Request type for rate limiting
 */
interface RateLimitRequest extends Request {
  rateLimit?: {
    limit: number;
    current: number;
    remaining: number;
  };
}

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (
  req: Request,
  res: Response,
  _next: NextFunction,
  options: any
): void => {
  const key = (req as RateLimitRequest).rateLimit?.limit ? userKeyGenerator(req) : 'unknown';
  rateLimitStats.recordBlock(key);

  res.status(429).json({
    error: 'Too Many Requests',
    message: options.message || 'Rate limit exceeded. Please try again later.',
    retryAfter: res.getHeader('Retry-After'),
    limit: (req as RateLimitRequest).rateLimit?.limit,
    current: (req as RateLimitRequest).rateLimit?.current,
    remaining: (req as RateLimitRequest).rateLimit?.remaining,
  });
};

/**
 * Create a rate limiter with the given configuration
 */
function createRateLimiter(
  config: RateLimitConfig,
  keyGenerator?: (req: Request) => string
): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: config.standardHeaders,
    legacyHeaders: config.legacyHeaders,
    skipSuccessfulRequests: config.skipSuccessfulRequests,
    skipFailedRequests: config.skipFailedRequests,
    keyGenerator: keyGenerator || ipKeyGenerator,
    handler: rateLimitHandler,
  });
}

/**
 * Per-user rate limiter: 60 requests per hour
 */
export const userRateLimiter = createRateLimiter(
  perUserRateLimit,
  userKeyGenerator
);

/**
 * Per-IP rate limiter: 100 requests per hour
 */
export const ipRateLimiter = createRateLimiter(perIpRateLimit, ipKeyGenerator);

/**
 * Global rate limiter: 1000 requests per hour
 */
export const globalRateLimiter = createRateLimiter(
  globalRateLimit,
  globalKeyGenerator
);

/**
 * Burst rate limiter: 10 requests per minute
 */
export const burstRateLimiter = createRateLimiter(
  burstRateLimit,
  userKeyGenerator
);

/**
 * AI query rate limiter: 30 requests per hour (more restrictive)
 */
export const aiQueryRateLimiter = createRateLimiter(
  aiQueryRateLimit,
  userKeyGenerator
);

/**
 * Default rate limiter: 30 requests per 15 minutes
 */
export const defaultRateLimiter = createRateLimiter(
  defaultRateLimit,
  ipKeyGenerator
);

/**
 * Combined rate limiter middleware
 * Applies multiple rate limiting strategies in sequence
 */
export const multiStrategyRateLimiter = (
  strategies: RateLimitStrategy[] = [
    RateLimitStrategy.BURST,
    RateLimitStrategy.USER,
    RateLimitStrategy.GLOBAL,
  ]
) => {
  const limiters: RateLimitRequestHandler[] = [];

  strategies.forEach((strategy) => {
    switch (strategy) {
      case RateLimitStrategy.USER:
        limiters.push(userRateLimiter);
        break;
      case RateLimitStrategy.IP:
        limiters.push(ipRateLimiter);
        break;
      case RateLimitStrategy.GLOBAL:
        limiters.push(globalRateLimiter);
        break;
      case RateLimitStrategy.BURST:
        limiters.push(burstRateLimiter);
        break;
      case RateLimitStrategy.AI_QUERY:
        limiters.push(aiQueryRateLimiter);
        break;
      case RateLimitStrategy.DEFAULT:
        limiters.push(defaultRateLimiter);
        break;
    }
  });

  return (req: Request, res: Response, next: NextFunction) => {
    let index = 0;

    const runNext = (err?: any) => {
      if (err) {
        return next(err);
      }

      if (index >= limiters.length) {
        return next();
      }

      const limiter = limiters[index++];
      limiter(req, res, runNext);
    };

    runNext();
  };
};

/**
 * Rate limiter for AI query endpoints
 * Combines burst protection with AI-specific limits
 */
export const aiRateLimiter = multiStrategyRateLimiter([
  RateLimitStrategy.BURST,
  RateLimitStrategy.AI_QUERY,
  RateLimitStrategy.GLOBAL,
]);

/**
 * Rate limiter for general API endpoints
 * Combines burst protection with user/IP limits
 */
export const apiRateLimiter = multiStrategyRateLimiter([
  RateLimitStrategy.BURST,
  RateLimitStrategy.USER,
  RateLimitStrategy.GLOBAL,
]);

/**
 * Custom throttling middleware
 * Adds delays to requests if rate is too high
 */
interface ThrottleConfig {
  maxRequestsPerSecond: number;
  delayMs?: number;
}

class RequestThrottler {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequestsPerSecond: number;

  constructor(config: ThrottleConfig) {
    this.maxRequestsPerSecond = config.maxRequestsPerSecond;
  }

  async throttle(key: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - 1000; // 1 second window

    // Get or initialize request timestamps for this key
    let timestamps = this.requests.get(key) || [];

    // Remove old timestamps outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart);

    // Check if we've exceeded the rate
    if (timestamps.length >= this.maxRequestsPerSecond) {
      // Calculate delay needed
      const oldestInWindow = timestamps[0];
      const delay = oldestInWindow + 1000 - now;

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Add current timestamp
    timestamps.push(now);
    this.requests.set(key, timestamps);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - 1000;

    const entries = Array.from(this.requests.entries());
    for (const [key, timestamps] of entries) {
      const filtered = timestamps.filter((ts) => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

const requestThrottler = new RequestThrottler({
  maxRequestsPerSecond: 5,
  delayMs: 1000,
});

/**
 * Throttling middleware
 * Adds small delays if request rate is too high
 */
export const throttleMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const key = userKeyGenerator(req);
    await requestThrottler.throttle(key);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Get rate limit statistics
 */
export const getRateLimitStats = (_req: Request, res: Response): void => {
  const stats = rateLimitStats.getAllStats();
  const statsObj: Record<string, any> = {};

  stats.forEach((value, key) => {
    statsObj[key] = value;
  });

  res.json({
    statistics: statsObj,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Reset rate limit statistics
 */
export const resetRateLimitStats = (_req: Request, res: Response): void => {
  rateLimitStats.clearAll();
  res.json({
    message: 'Rate limit statistics reset successfully',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Export all rate limiters and utilities
 */
export default {
  userRateLimiter,
  ipRateLimiter,
  globalRateLimiter,
  burstRateLimiter,
  aiQueryRateLimiter,
  defaultRateLimiter,
  multiStrategyRateLimiter,
  aiRateLimiter,
  apiRateLimiter,
  throttleMiddleware,
  getRateLimitStats,
  resetRateLimitStats,
  RateLimitStrategy,
};
