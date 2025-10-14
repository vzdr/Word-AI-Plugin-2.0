/**
 * useRetry Hook
 *
 * React hook for managing retry logic with exponential backoff.
 * Tracks retry state and provides methods to execute async operations with automatic retries.
 */

import { useState, useCallback, useRef } from 'react';
import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  calculateDelay,
  shouldRetryError,
} from '../utils/retry';

/**
 * Result object returned by useRetry hook
 */
export interface UseRetryResult<T> {
  /**
   * Execute the async function with retry logic
   * @returns Promise resolving to function result
   * @throws Error if all retry attempts fail
   */
  execute: () => Promise<T>;

  /**
   * Whether a retry is currently in progress (waiting between attempts)
   */
  isRetrying: boolean;

  /**
   * Current retry attempt count (0 when not retrying)
   */
  retryCount: number;

  /**
   * Maximum number of retry attempts configured
   */
  maxRetries: number;

  /**
   * Reset retry state to initial values
   */
  reset: () => void;
}

/**
 * Hook for managing async operations with retry logic
 *
 * Implements exponential backoff and tracks retry state.
 * Only retries transient errors (503, timeout, network).
 * Does NOT retry permanent errors (400, 401, 404).
 *
 * @param asyncFn - Async function to execute with retry logic
 * @param config - Optional retry configuration (merged with defaults)
 * @returns Object with execute method and retry state
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { execute, isRetrying, retryCount, maxRetries } = useRetry(
 *     async () => {
 *       const response = await fetch('/api/data');
 *       if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *       return response.json();
 *     },
 *     { maxAttempts: 3, initialDelay: 1000 }
 *   );
 *
 *   const handleClick = async () => {
 *     try {
 *       const data = await execute();
 *       console.log('Success:', data);
 *     } catch (error) {
 *       console.error('Failed after retries:', error);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick}>Fetch Data</button>
 *       {isRetrying && <p>Retrying... ({retryCount}/{maxRetries})</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useRetry<T>(
  asyncFn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): UseRetryResult<T> {
  const retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  // State for tracking retries
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Use ref to track if component is mounted (prevent state updates after unmount)
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Execute async function with retry logic
   */
  const execute = useCallback(async (): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt < retryConfig.maxAttempts; attempt++) {
      try {
        // Reset retry state on successful attempt
        if (isMountedRef.current && attempt > 0) {
          setIsRetrying(false);
          setRetryCount(0);
        }

        // Execute the async function
        const result = await asyncFn();

        // Success - reset state if needed
        if (isMountedRef.current && (isRetrying || retryCount > 0)) {
          setIsRetrying(false);
          setRetryCount(0);
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        const shouldRetry = retryConfig.shouldRetry
          ? retryConfig.shouldRetry(lastError)
          : shouldRetryError(lastError);

        // If this is the last attempt or error shouldn't be retried, throw immediately
        if (attempt === retryConfig.maxAttempts - 1 || !shouldRetry) {
          // Reset retry state before throwing
          if (isMountedRef.current) {
            setIsRetrying(false);
            setRetryCount(0);
          }
          throw lastError;
        }

        // Calculate delay for next attempt
        const delay = calculateDelay(attempt, retryConfig);

        // Update retry state
        if (isMountedRef.current) {
          setIsRetrying(true);
          setRetryCount(attempt + 1);
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // This should never be reached due to throw in loop, but TypeScript needs it
    throw lastError!;
  }, [asyncFn, retryConfig, isRetrying, retryCount]);

  /**
   * Reset retry state to initial values
   */
  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setIsRetrying(false);
      setRetryCount(0);
    }
  }, []);

  return {
    execute,
    isRetrying,
    retryCount,
    maxRetries: retryConfig.maxAttempts,
    reset,
  };
}

/**
 * React import for useEffect
 * (Some environments may need this separate import)
 */
import * as React from 'react';
