/**
 * Retry Utilities
 *
 * Provides retry logic with exponential backoff for handling transient failures.
 * Implements configurable retry strategies for async operations.
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   * @default 3
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 1000
   */
  initialDelay: number;

  /**
   * Maximum delay in milliseconds between retries
   * @default 10000
   */
  maxDelay: number;

  /**
   * Multiplier for exponential backoff
   * @default 2
   */
  backoffMultiplier: number;

  /**
   * Custom function to determine if an error should be retried
   * If not provided, uses default shouldRetryError logic
   */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Default retry configuration
 * Suitable for most API calls with transient failures
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Calculate delay for a given retry attempt using exponential backoff
 *
 * @param attempt - Current retry attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds before next retry
 *
 * @example
 * ```typescript
 * calculateDelay(0, DEFAULT_RETRY_CONFIG); // 1000ms
 * calculateDelay(1, DEFAULT_RETRY_CONFIG); // 2000ms
 * calculateDelay(2, DEFAULT_RETRY_CONFIG); // 4000ms
 * calculateDelay(3, DEFAULT_RETRY_CONFIG); // 8000ms
 * calculateDelay(4, DEFAULT_RETRY_CONFIG); // 10000ms (capped at maxDelay)
 * ```
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * Determine if an error should be retried based on its characteristics
 *
 * Retries transient errors that might succeed on retry:
 * - Network errors
 * - Timeout errors
 * - Rate limit errors (429)
 * - Service unavailable errors (503)
 * - Gateway errors (502, 504)
 *
 * Does NOT retry permanent errors:
 * - Bad request (400)
 * - Unauthorized (401)
 * - Forbidden (403)
 * - Not found (404)
 * - Unprocessable entity (422)
 *
 * @param error - Error to evaluate
 * @returns True if error should be retried
 *
 * @example
 * ```typescript
 * const networkError = new Error('Network connection failed');
 * shouldRetryError(networkError); // true
 *
 * const authError = new Error('401 Unauthorized');
 * shouldRetryError(authError); // false
 * ```
 */
export function shouldRetryError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  // Check for network-related errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('connection') ||
    error.name === 'NetworkError' ||
    error.name === 'TypeError'
  ) {
    return true;
  }

  // Check for timeout errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    error.name === 'AbortError' ||
    error.name === 'TimeoutError'
  ) {
    return true;
  }

  // Check for HTTP status codes in error message
  // Extract status code from common error message patterns
  const statusMatch = errorMessage.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);

    // Retry transient server errors
    if (statusCode === 429 || statusCode === 503 || statusCode === 502 || statusCode === 504) {
      return true;
    }

    // Do NOT retry client errors (permanent failures)
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }

    // Retry other 5xx errors (server errors)
    if (statusCode >= 500) {
      return true;
    }
  }

  // Check for specific error types if available
  if ('statusCode' in error) {
    const statusCode = (error as any).statusCode;
    if (typeof statusCode === 'number') {
      // Retry transient server errors
      if (statusCode === 429 || statusCode === 503 || statusCode === 502 || statusCode === 504) {
        return true;
      }

      // Do NOT retry client errors
      if (statusCode >= 400 && statusCode < 500) {
        return false;
      }

      // Retry other 5xx errors
      if (statusCode >= 500) {
        return true;
      }
    }
  }

  // Check for rate limit errors
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return true;
  }

  // Check for service unavailable errors
  if (
    errorMessage.includes('service unavailable') ||
    errorMessage.includes('temporarily unavailable') ||
    errorMessage.includes('backend')
  ) {
    return true;
  }

  // Default: do not retry unknown errors
  return false;
}

/**
 * Execute an async function with retry logic
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration (merged with defaults)
 * @param onRetry - Optional callback invoked before each retry attempt
 * @returns Promise resolving to function result
 * @throws Last error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => {
 *     const response = await fetch('/api/data');
 *     return response.json();
 *   },
 *   { maxAttempts: 3, initialDelay: 1000 },
 *   (attempt, delay) => console.log(`Retrying... attempt ${attempt}, delay ${delay}ms`)
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: Error) => void
): Promise<T> {
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      const shouldRetry = retryConfig.shouldRetry
        ? retryConfig.shouldRetry(lastError)
        : shouldRetryError(lastError);

      // If this is the last attempt or error shouldn't be retried, throw immediately
      if (attempt === retryConfig.maxAttempts - 1 || !shouldRetry) {
        throw lastError;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, retryConfig);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, delay, lastError);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached due to throw in loop, but TypeScript needs it
  throw lastError!;
}

/**
 * Create a retry wrapper for a function
 *
 * Returns a new function that automatically retries on failure
 *
 * @param fn - Function to wrap with retry logic
 * @param config - Retry configuration
 * @returns Wrapped function with retry behavior
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(
 *   async (url: string) => {
 *     const response = await fetch(url);
 *     return response.json();
 *   },
 *   { maxAttempts: 3 }
 * );
 *
 * const data = await fetchWithRetry('/api/data');
 * ```
 */
export function withRetry<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  config: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return retryWithBackoff(() => fn(...args), config);
  };
}
