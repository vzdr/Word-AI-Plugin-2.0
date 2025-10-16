/**
 * Comprehensive tests for retry.ts
 *
 * Tests retry utilities with comprehensive scenarios:
 * - Exponential backoff calculation
 * - Retry with success
 * - Retry with max attempts exceeded
 * - Different retry configurations
 * - Error classification (retryable vs non-retryable)
 * - Custom retry conditions
 */

import {
  retryWithBackoff,
  calculateDelay,
  shouldRetryError,
  withRetry,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from '../retry';

describe('retry utilities', () => {
  describe('calculateDelay', () => {
    it('should calculate exponential backoff', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      };

      expect(calculateDelay(0, config)).toBe(1000); // 1000 * 2^0 = 1000
      expect(calculateDelay(1, config)).toBe(2000); // 1000 * 2^1 = 2000
      expect(calculateDelay(2, config)).toBe(4000); // 1000 * 2^2 = 4000
      expect(calculateDelay(3, config)).toBe(8000); // 1000 * 2^3 = 8000
    });

    it('should cap at maxDelay', () => {
      const config: RetryConfig = {
        maxAttempts: 10,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
      };

      expect(calculateDelay(4, config)).toBe(5000); // Would be 16000, capped at 5000
      expect(calculateDelay(5, config)).toBe(5000);
      expect(calculateDelay(10, config)).toBe(5000);
    });

    it('should handle different backoff multipliers', () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 100,
        maxDelay: 10000,
        backoffMultiplier: 3,
      };

      expect(calculateDelay(0, config)).toBe(100); // 100 * 3^0 = 100
      expect(calculateDelay(1, config)).toBe(300); // 100 * 3^1 = 300
      expect(calculateDelay(2, config)).toBe(900); // 100 * 3^2 = 900
    });

    it('should handle zero attempt', () => {
      expect(calculateDelay(0, DEFAULT_RETRY_CONFIG)).toBe(1000);
    });

    it('should handle very small initial delay', () => {
      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 10,
        maxDelay: 1000,
        backoffMultiplier: 2,
      };

      expect(calculateDelay(0, config)).toBe(10);
      expect(calculateDelay(1, config)).toBe(20);
      expect(calculateDelay(2, config)).toBe(40);
    });
  });

  describe('shouldRetryError', () => {
    describe('network errors', () => {
      it('should retry network errors', () => {
        const error = new Error('Network connection failed');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry fetch errors', () => {
        const error = new Error('fetch failed');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry connection errors', () => {
        const error = new Error('connection refused');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry NetworkError by name', () => {
        const error = new Error('Something went wrong');
        error.name = 'NetworkError';
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry TypeError', () => {
        const error = new TypeError('Failed to fetch');
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('timeout errors', () => {
      it('should retry timeout errors', () => {
        const error = new Error('Request timeout');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry timed out errors', () => {
        const error = new Error('Request timed out');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry AbortError by name', () => {
        const error = new Error('Operation aborted');
        error.name = 'AbortError';
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry TimeoutError by name', () => {
        const error = new Error('Operation timeout');
        error.name = 'TimeoutError';
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('HTTP status codes', () => {
      it('should retry 429 Too Many Requests', () => {
        const error = new Error('Error 429: Too Many Requests');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry 503 Service Unavailable', () => {
        const error = new Error('503 Service Unavailable');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry 502 Bad Gateway', () => {
        const error = new Error('502 Bad Gateway');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry 504 Gateway Timeout', () => {
        const error = new Error('504 Gateway Timeout');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should NOT retry 400 Bad Request', () => {
        const error = new Error('400 Bad Request');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry 401 Unauthorized', () => {
        const error = new Error('401 Unauthorized');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry 403 Forbidden', () => {
        const error = new Error('403 Forbidden');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry 404 Not Found', () => {
        const error = new Error('404 Not Found');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry 422 Unprocessable Entity', () => {
        const error = new Error('422 Unprocessable Entity');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should retry other 5xx errors', () => {
        const error = new Error('500 Internal Server Error');
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('status code from error object', () => {
      it('should retry based on statusCode property', () => {
        const error: any = new Error('Server error');
        error.statusCode = 503;
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should NOT retry 4xx with statusCode property', () => {
        const error: any = new Error('Client error');
        error.statusCode = 400;
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should retry 429 with statusCode property', () => {
        const error: any = new Error('Rate limit');
        error.statusCode = 429;
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('rate limit errors', () => {
      it('should retry rate limit errors', () => {
        const error = new Error('Rate limit exceeded');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry too many requests', () => {
        const error = new Error('Too many requests');
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('service unavailable errors', () => {
      it('should retry service unavailable', () => {
        const error = new Error('Service unavailable');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry temporarily unavailable', () => {
        const error = new Error('Temporarily unavailable');
        expect(shouldRetryError(error)).toBe(true);
      });

      it('should retry backend errors', () => {
        const error = new Error('Backend service error');
        expect(shouldRetryError(error)).toBe(true);
      });
    });

    describe('non-retryable errors', () => {
      it('should NOT retry unknown errors by default', () => {
        const error = new Error('Something went wrong');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry validation errors', () => {
        const error = new Error('Validation failed');
        expect(shouldRetryError(error)).toBe(false);
      });

      it('should NOT retry authentication errors', () => {
        const error = new Error('Authentication failed');
        expect(shouldRetryError(error)).toBe(false);
      });
    });
  });

  describe('retryWithBackoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValueOnce('success');

      const promise = retryWithBackoff(fn);
      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('success');

      const promise = retryWithBackoff(fn);

      // Fast-forward through delays
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const error = new Error('503 Service Unavailable');
      const fn = jest.fn().mockRejectedValue(error);

      const config: Partial<RetryConfig> = {
        maxAttempts: 3,
        initialDelay: 100,
      };

      const promise = retryWithBackoff(fn, config);

      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('503 Service Unavailable');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry non-retryable errors', async () => {
      const error = new Error('400 Bad Request');
      const fn = jest.fn().mockRejectedValue(error);

      const promise = retryWithBackoff(fn);

      await expect(promise).rejects.toThrow('400 Bad Request');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom shouldRetry function', async () => {
      const error = new Error('Custom error');
      const fn = jest.fn().mockRejectedValue(error);

      const config: Partial<RetryConfig> = {
        maxAttempts: 3,
        shouldRetry: (err: Error) => err.message === 'Custom error',
      };

      const promise = retryWithBackoff(fn, config);

      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('Custom error');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const error = new Error('503 Service Unavailable');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const onRetry = jest.fn();

      const config: Partial<RetryConfig> = {
        initialDelay: 1000,
      };

      const promise = retryWithBackoff(fn, config, onRetry);

      await jest.runAllTimersAsync();

      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, 1000, error);
    });

    it('should wait correct delay between retries', async () => {
      const error = new Error('503 Service Unavailable');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: Partial<RetryConfig> = {
        initialDelay: 1000,
        backoffMultiplier: 2,
      };

      const promise = retryWithBackoff(fn, config);

      // First call
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(1);

      // Advance by first delay (1000ms)
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(2);

      // Advance by second delay (2000ms)
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should handle non-Error rejections', async () => {
      const fn = jest.fn().mockRejectedValueOnce('string error');

      const promise = retryWithBackoff(fn);

      await expect(promise).rejects.toThrow('string error');
    });

    it('should merge config with defaults', async () => {
      const fn = jest.fn().mockResolvedValueOnce('success');

      const config: Partial<RetryConfig> = {
        maxAttempts: 5, // Override default
      };

      await retryWithBackoff(fn, config);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw on last attempt even if retryable', async () => {
      const error = new Error('503 Service Unavailable');
      const fn = jest.fn().mockRejectedValue(error);

      const config: Partial<RetryConfig> = {
        maxAttempts: 2,
      };

      const promise = retryWithBackoff(fn, config);

      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow('503 Service Unavailable');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle custom retry configuration', async () => {
      const error = new Error('Custom retryable');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 3,
        shouldRetry: (err: Error) => err.message.includes('retryable'),
      };

      const promise = retryWithBackoff(fn, config);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create a retrying wrapper function', async () => {
      const originalFn = jest.fn().mockResolvedValueOnce('success');

      const wrappedFn = withRetry(originalFn);

      const promise = wrappedFn();
      const result = await promise;

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to wrapped function', async () => {
      const originalFn = jest
        .fn()
        .mockImplementation(async (a: number, b: string) => `${a}-${b}`);

      const wrappedFn = withRetry(originalFn);

      const promise = wrappedFn(42, 'test');
      const result = await promise;

      expect(result).toBe('42-test');
      expect(originalFn).toHaveBeenCalledWith(42, 'test');
    });

    it('should retry wrapped function on failure', async () => {
      const originalFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('503 Service Unavailable'))
        .mockResolvedValueOnce('success');

      const wrappedFn = withRetry(originalFn);

      const promise = wrappedFn();

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should accept custom retry config', async () => {
      const originalFn = jest.fn().mockResolvedValueOnce('success');

      const config: Partial<RetryConfig> = {
        maxAttempts: 5,
        initialDelay: 2000,
      };

      const wrappedFn = withRetry(originalFn, config);

      await wrappedFn();

      expect(originalFn).toHaveBeenCalledTimes(1);
    });

    it('should maintain type safety', async () => {
      const typedFn = async (num: number): Promise<string> => {
        return `Result: ${num}`;
      };

      const wrappedFn = withRetry(typedFn);

      const result = await wrappedFn(123);

      expect(result).toBe('Result: 123');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle maxAttempts = 1 (no retries)', async () => {
      const fn = jest.fn().mockRejectedValueOnce(new Error('Failed'));

      const config: Partial<RetryConfig> = {
        maxAttempts: 1,
      };

      await expect(retryWithBackoff(fn, config)).rejects.toThrow('Failed');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very high maxDelay', async () => {
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 1000000,
        backoffMultiplier: 2,
      };

      const delay = calculateDelay(10, config);

      expect(delay).toBe(1000000);
    });

    it('should handle errors without message', async () => {
      const error = new Error();
      error.message = '';

      expect(shouldRetryError(error)).toBe(false);
    });

    it('should handle mixed case in error messages', async () => {
      const error1 = new Error('NETWORK ERROR');
      const error2 = new Error('Network ERROR');

      expect(shouldRetryError(error1)).toBe(true);
      expect(shouldRetryError(error2)).toBe(true);
    });

    it('should handle multiple status codes in message', async () => {
      const error = new Error('Proxy error: 502 -> 503 Service Unavailable');

      expect(shouldRetryError(error)).toBe(true);
    });
  });

  describe('realistic scenarios', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle intermittent network issues', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network connection failed');
        }
        return 'success';
      });

      const promise = retryWithBackoff(fn);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limiting with backoff', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          throw new Error('429 Too Many Requests');
        }
        return 'success';
      });

      const onRetry = jest.fn();

      const promise = retryWithBackoff(fn, {}, onRetry);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should give up on permanent errors quickly', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('401 Unauthorized'));

      const promise = retryWithBackoff(fn);

      await expect(promise).rejects.toThrow('401 Unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
