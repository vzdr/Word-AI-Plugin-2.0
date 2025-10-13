import * as crypto from 'crypto';

/**
 * Cache Entry Interface
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

/**
 * Cache Statistics Interface
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  evictions: number;
  hitRate: number;
  totalRequests: number;
}

/**
 * Cache Configuration Interface
 */
export interface CacheConfig {
  maxSize?: number;
  defaultTTL?: number;
  enableStats?: boolean;
}

/**
 * Cache Key Generation Parameters
 */
export interface CacheKeyParams {
  question: string;
  context?: string | string[];
  settings?: Record<string, any>;
}

/**
 * In-Memory LRU Cache with TTL Support
 *
 * Features:
 * - LRU (Least Recently Used) eviction strategy
 * - TTL (Time To Live) support for automatic expiration
 * - Cache statistics tracking (hits, misses, evictions)
 * - Hash-based cache key generation
 * - Maximum size limit with automatic eviction
 */
export class InMemoryCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private stats: CacheStats;
  private readonly enableStats: boolean;

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize || 1000;
    this.defaultTTL = config.defaultTTL || 60 * 60 * 1000; // 1 hour default
    this.enableStats = config.enableStats !== false;
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      maxSize: this.maxSize,
      evictions: 0,
      hitRate: 0,
      totalRequests: 0,
    };
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    this.updateStats('request');

    const entry = this.cache.get(key);

    // Check if entry exists and hasn't expired
    if (entry) {
      if (Date.now() < entry.expiresAt) {
        // Update access metadata for LRU
        entry.lastAccessed = Date.now();
        entry.accessCount++;

        this.updateStats('hit');
        return entry.value;
      } else {
        // Entry expired, remove it
        this.cache.delete(key);
        this.updateStats('miss');
      }
    } else {
      this.updateStats('miss');
    }

    return undefined;
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set(key: string, value: T, ttl?: number): void {
    const expirationTime = ttl || this.defaultTTL;

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + expirationTime,
      accessCount: 0,
      lastAccessed: Date.now(),
      size: this.estimateSize(value),
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  /**
   * Check if a key exists and is valid (not expired)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() < entry.expiresAt) {
      return true;
    }

    // Expired, remove it
    this.cache.delete(key);
    return false;
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return deleted;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      size: this.cache.size,
      maxSize: this.maxSize,
      evictions: 0,
      hitRate: 0,
      totalRequests: 0,
    };
  }

  /**
   * Get all keys in the cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get the current size of the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find the least recently used entry
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Estimate the size of a value (for memory tracking)
   */
  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(type: 'hit' | 'miss' | 'request'): void {
    if (!this.enableStats) return;

    if (type === 'request') {
      this.stats.totalRequests++;
    } else if (type === 'hit') {
      this.stats.hits++;
    } else if (type === 'miss') {
      this.stats.misses++;
    }

    // Calculate hit rate
    if (this.stats.totalRequests > 0) {
      this.stats.hitRate = this.stats.hits / this.stats.totalRequests;
    }

    this.stats.size = this.cache.size;
  }

  /**
   * Remove expired entries from the cache
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.size = this.cache.size;
    return removed;
  }

  /**
   * Get all entries (for debugging/testing)
   */
  getAll(): Map<string, T> {
    const result = new Map<string, T>();
    const now = Date.now();

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now < entry.expiresAt) {
        result.set(key, entry.value);
      }
    }

    return result;
  }
}

/**
 * Generate a cache key from request parameters
 * Uses SHA-256 hashing for consistent key generation
 */
export function generateCacheKey(params: CacheKeyParams): string {
  const { question, context, settings } = params;

  // Normalize context (handle arrays and strings)
  const normalizedContext = Array.isArray(context)
    ? context.join('|')
    : context || '';

  // Create a deterministic string representation
  const keyData = JSON.stringify({
    q: question.trim().toLowerCase(),
    c: normalizedContext,
    s: settings || {},
  });

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

/**
 * Default cache instance for AI queries
 */
export const aiQueryCache = new InMemoryCache({
  maxSize: 1000,
  defaultTTL: 60 * 60 * 1000, // 1 hour
  enableStats: true,
});

/**
 * Periodic cleanup of expired entries (runs every 5 minutes)
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const removed = aiQueryCache.cleanup();
    if (removed > 0) {
      console.log(`[Cache] Cleaned up ${removed} expired entries`);
    }
  }, 5 * 60 * 1000);
}

/**
 * Export cache utilities
 */
export default {
  InMemoryCache,
  generateCacheKey,
  aiQueryCache,
};
