/**
 * useAsync Hook
 *
 * Generic React hook for managing async operation state.
 * Provides loading, error, and data states with optional callbacks and immediate execution.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Options for useAsync hook
 */
export interface UseAsyncOptions<T> {
  /**
   * Whether to execute the async function immediately on mount
   * @default false
   */
  immediate?: boolean;

  /**
   * Callback invoked when async function succeeds
   */
  onSuccess?: (data: T) => void;

  /**
   * Callback invoked when async function fails
   */
  onError?: (error: Error) => void;
}

/**
 * Result object returned by useAsync hook
 */
export interface UseAsyncResult<T> {
  /**
   * Data returned by async function (null if not yet loaded or error occurred)
   */
  data: T | null;

  /**
   * Whether async operation is currently in progress
   */
  loading: boolean;

  /**
   * Error from async operation (null if no error)
   */
  error: Error | null;

  /**
   * Execute the async function with provided arguments
   * @param args - Arguments to pass to async function
   * @returns Promise resolving when operation completes
   */
  execute: (...args: any[]) => Promise<void>;

  /**
   * Reset state to initial values (clears data, error, and loading state)
   */
  reset: () => void;
}

/**
 * Hook for managing async operation state
 *
 * Handles loading, error, and data states for async operations.
 * Provides execute method to trigger operation and callbacks for success/error.
 * Includes cleanup to prevent state updates after component unmount.
 *
 * @param asyncFn - Async function to execute
 * @param options - Optional configuration
 * @returns Object with data, loading, error states and control methods
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { data, loading, error, execute } = useAsync(
 *     async (userId: string) => {
 *       const response = await fetch(`/api/users/${userId}`);
 *       return response.json();
 *     },
 *     {
 *       onSuccess: (user) => console.log('Loaded user:', user),
 *       onError: (error) => console.error('Failed to load user:', error)
 *     }
 *   );
 *
 *   const handleClick = () => {
 *     execute('user-123');
 *   };
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!data) return <div>No data</div>;
 *
 *   return <div>User: {data.name}</div>;
 * }
 * ```
 *
 * @example
 * // With immediate execution
 * ```typescript
 * function MyComponent({ userId }: { userId: string }) {
 *   const { data, loading, error } = useAsync(
 *     async () => {
 *       const response = await fetch(`/api/users/${userId}`);
 *       return response.json();
 *     },
 *     { immediate: true }
 *   );
 *
 *   // Automatically loads on mount
 * }
 * ```
 */
export function useAsync<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  options: UseAsyncOptions<T> = {}
): UseAsyncResult<T> {
  const { immediate = false, onSuccess, onError } = options;

  // State management
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Use ref to track if component is mounted (prevent state updates after unmount)
  const isMountedRef = useRef(true);

  // Store callbacks in refs to avoid re-creating execute on every callback change
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // Update callback refs when they change
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Execute the async function
   */
  const execute = useCallback(
    async (...args: any[]): Promise<void> => {
      // Set loading state and clear previous error
      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        // Execute async function
        const result = await asyncFn(...args);

        // Update state with result (only if still mounted)
        if (isMountedRef.current) {
          setData(result);
          setLoading(false);

          // Invoke success callback
          if (onSuccessRef.current) {
            onSuccessRef.current(result);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // Update state with error (only if still mounted)
        if (isMountedRef.current) {
          setError(error);
          setData(null);
          setLoading(false);

          // Invoke error callback
          if (onErrorRef.current) {
            onErrorRef.current(error);
          }
        }
      }
    },
    [asyncFn]
  );

  /**
   * Reset state to initial values
   */
  const reset = useCallback(() => {
    if (isMountedRef.current) {
      setData(null);
      setLoading(false);
      setError(null);
    }
  }, []);

  /**
   * Execute immediately on mount if requested
   */
  useEffect(() => {
    if (immediate) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

/**
 * Hook for managing async operations with automatic retry
 *
 * Combines useAsync with retry logic for resilient async operations.
 * Automatically retries failed operations with exponential backoff.
 *
 * @param asyncFn - Async function to execute
 * @param retryConfig - Retry configuration
 * @param options - Additional async options
 * @returns Object with data, loading, error states, retry info, and control methods
 *
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { data, loading, error, execute, retryCount, isRetrying } = useAsyncWithRetry(
 *     async () => {
 *       const response = await fetch('/api/data');
 *       if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *       return response.json();
 *     },
 *     { maxAttempts: 3, initialDelay: 1000 }
 *   );
 *
 *   if (loading) {
 *     if (isRetrying) {
 *       return <div>Retrying... (attempt {retryCount})</div>;
 *     }
 *     return <div>Loading...</div>;
 *   }
 *
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!data) return <div>No data</div>;
 *
 *   return <div>Data: {JSON.stringify(data)}</div>;
 * }
 * ```
 */
export function useAsyncWithRetry<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  retryConfig?: Partial<import('../utils/retry').RetryConfig>,
  options?: UseAsyncOptions<T>
): UseAsyncResult<T> & {
  retryCount: number;
  isRetrying: boolean;
  maxRetries: number;
} {
  // Import useRetry dynamically to avoid circular dependencies
  const { useRetry } = require('./useRetry');

  // Create retry wrapper
  const { execute: executeWithRetry, isRetrying, retryCount, maxRetries } = useRetry(
    asyncFn,
    retryConfig
  );

  // Use standard async hook with retry wrapper
  const asyncResult = useAsync(executeWithRetry, options);

  return {
    ...asyncResult,
    isRetrying,
    retryCount,
    maxRetries,
  };
}
