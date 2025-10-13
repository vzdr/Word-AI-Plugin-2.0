/**
 * Rate Limiting Configuration
 *
 * Defines rate limiting strategies for API endpoints:
 * - Per User: 60 requests/hour
 * - Per IP: 100 requests/hour
 * - Global: 1000 requests/hour
 * - Burst: 10 requests/minute
 */

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  activeWindows: number;
  lastReset: Date;
}

/**
 * Per-user rate limit: 60 requests per hour
 */
export const perUserRateLimit: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 requests per hour
  message: 'Too many requests from this user, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
};

/**
 * Per-IP rate limit: 100 requests per hour
 */
export const perIpRateLimit: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour
  message: 'Too many requests from this IP address, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
};

/**
 * Global rate limit: 1000 requests per hour
 */
export const globalRateLimit: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour
  message: 'Global rate limit exceeded, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
};

/**
 * Burst rate limit: 10 requests per minute
 * Used to prevent sudden spikes in traffic
 */
export const burstRateLimit: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many requests in a short time, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
};

/**
 * Rate limit configuration for different endpoint types
 */
export const rateLimitConfigs = {
  user: perUserRateLimit,
  ip: perIpRateLimit,
  global: globalRateLimit,
  burst: burstRateLimit,
};

/**
 * Default rate limit for unauthenticated requests
 */
export const defaultRateLimit: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Rate limit for AI query endpoints (more restrictive)
 */
export const aiQueryRateLimit: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 AI queries per hour
  message: 'AI query rate limit exceeded. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: true,
};

/**
 * Rate limit statistics tracker
 */
export class RateLimitStatistics {
  private stats: Map<string, RateLimitStats> = new Map();

  getStats(key: string): RateLimitStats | undefined {
    return this.stats.get(key);
  }

  recordRequest(key: string): void {
    const existing = this.stats.get(key);
    if (existing) {
      existing.totalRequests++;
    } else {
      this.stats.set(key, {
        totalRequests: 1,
        blockedRequests: 0,
        activeWindows: 1,
        lastReset: new Date(),
      });
    }
  }

  recordBlock(key: string): void {
    const existing = this.stats.get(key);
    if (existing) {
      existing.blockedRequests++;
    } else {
      this.stats.set(key, {
        totalRequests: 0,
        blockedRequests: 1,
        activeWindows: 1,
        lastReset: new Date(),
      });
    }
  }

  reset(key: string): void {
    const existing = this.stats.get(key);
    if (existing) {
      existing.lastReset = new Date();
      existing.totalRequests = 0;
      existing.blockedRequests = 0;
    }
  }

  getAllStats(): Map<string, RateLimitStats> {
    return new Map(this.stats);
  }

  clearAll(): void {
    this.stats.clear();
  }
}

export const rateLimitStats = new RateLimitStatistics();
