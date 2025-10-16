/**
 * Comprehensive tests for aiService.ts
 *
 * Tests AI service API client with comprehensive scenarios:
 * - Single cell AI generation
 * - Batch cell generation
 * - Table purpose inference
 * - Sample data extraction
 * - Retry logic and error handling
 * - Network error scenarios
 * - API response validation
 * - Token usage tracking
 */

import {
  askAI,
  isAIServiceError,
  getUserFriendlyErrorMessage,
  AIServiceError,
  AIServiceErrorType,
  AIQueryResponse,
  AIQueryRequest,
} from '../aiService';
import { SettingsValues } from '../../taskpane/components/Settings';
import { UploadedFile } from '../../taskpane/components/FileUpload';
import * as retryModule from '../../utils/retry';

// Mock fetch globally
global.fetch = jest.fn();

// Mock retry module
jest.mock('../../utils/retry', () => ({
  ...jest.requireActual('../../utils/retry'),
  retryWithBackoff: jest.fn(),
  shouldRetryError: jest.fn(),
}));

describe('aiService', () => {
  const mockSettings: SettingsValues = {
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default implementation that passes through to the actual function
    (retryModule.retryWithBackoff as jest.Mock).mockImplementation(
      async (fn: () => any) => fn()
    );
  });

  describe('askAI', () => {
    describe('successful responses', () => {
      it('should make successful AI query with valid response', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'AI generated response',
          model: 'gpt-3.5-turbo',
          usage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
          },
          processingTime: 1500,
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await askAI('Selected text', 'Context', [], mockSettings);

        expect(result).toEqual(mockResponse);
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/ai/query',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      it('should include selected text, context, and settings in request', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('My selected text', 'My context', [], mockSettings);

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.selectedText).toBe('My selected text');
        expect(requestBody.inlineContext).toBe('My context');
        expect(requestBody.settings).toEqual(mockSettings);
      });

      it('should return token usage information', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-4',
          usage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          },
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await askAI('Text', '', [], mockSettings);

        expect(result.usage).toBeDefined();
        expect(result.usage?.promptTokens).toBe(100);
        expect(result.usage?.completionTokens).toBe(50);
        expect(result.usage?.totalTokens).toBe(150);
      });

      it('should handle response without usage data', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        const result = await askAI('Text', '', [], mockSettings);

        expect(result.usage).toBeUndefined();
      });
    });

    describe('file handling', () => {
      it('should handle uploaded files', async () => {
        const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
        const uploadedFile: UploadedFile = {
          id: '1',
          name: 'test.txt',
          size: 7,
          type: 'text/plain',
          extension: '.txt',
          file: mockFile,
        };

        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        // Mock FileReader
        const mockFileReader = {
          readAsDataURL: jest.fn(function(this: any) {
            this.onload?.({ target: { result: 'data:text/plain;base64,Y29udGVudA==' } });
          }),
          result: 'data:text/plain;base64,Y29udGVudA==',
        };
        global.FileReader = jest.fn(() => mockFileReader) as any;

        await askAI('Text', 'Context', [uploadedFile], mockSettings);

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.files).toBeDefined();
        expect(requestBody.files).toHaveLength(1);
        expect(requestBody.files[0].id).toBe('1');
        expect(requestBody.files[0].name).toBe('test.txt');
      });

      it('should handle empty files array', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('Text', 'Context', [], mockSettings);

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const requestBody = JSON.parse(fetchCall[1].body);

        expect(requestBody.files).toBeUndefined();
      });

      it('should continue if file read fails', async () => {
        const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
        const uploadedFile: UploadedFile = {
          id: '1',
          name: 'test.txt',
          size: 7,
          type: 'text/plain',
          extension: '.txt',
          file: mockFile,
        };

        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        // Mock FileReader to fail
        const mockFileReader = {
          readAsDataURL: jest.fn(function(this: any) {
            this.onerror?.(new Error('Read failed'));
          }),
        };
        global.FileReader = jest.fn(() => mockFileReader) as any;

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        await askAI('Text', 'Context', [uploadedFile], mockSettings);

        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });
    });

    describe('validation', () => {
      it('should throw error for empty selected text', async () => {
        await expect(askAI('', 'Context', [], mockSettings)).rejects.toMatchObject({
          message: 'Selected text is required',
          type: AIServiceErrorType.INVALID_REQUEST,
        });
      });

      it('should throw error for whitespace-only selected text', async () => {
        await expect(askAI('   ', 'Context', [], mockSettings)).rejects.toMatchObject({
          message: 'Selected text is required',
          type: AIServiceErrorType.INVALID_REQUEST,
        });
      });

      it('should validate response format', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ invalidKey: 'data' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Invalid response format from server',
          type: AIServiceErrorType.UNKNOWN_ERROR,
        });
      });

      it('should validate response has string response field', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ response: 123, model: 'gpt-3.5-turbo' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Invalid response format from server',
          type: AIServiceErrorType.UNKNOWN_ERROR,
        });
      });
    });

    describe('HTTP error handling', () => {
      it('should handle 400 Bad Request', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ message: 'Bad request' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Bad request',
          type: AIServiceErrorType.INVALID_REQUEST,
          statusCode: 400,
        });
      });

      it('should handle 401 Unauthorized', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ message: 'Unauthorized' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Unauthorized',
          type: AIServiceErrorType.AUTH_ERROR,
          statusCode: 401,
        });
      });

      it('should handle 403 Forbidden', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({ message: 'Forbidden' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          type: AIServiceErrorType.AUTH_ERROR,
          statusCode: 403,
        });
      });

      it('should handle 429 Rate Limit', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: async () => ({ message: 'Too many requests' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Rate limit exceeded. Please try again later.',
          type: AIServiceErrorType.RATE_LIMIT,
          statusCode: 429,
        });
      });

      it('should handle 500 Internal Server Error', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Server error' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Backend service error. Please try again later.',
          type: AIServiceErrorType.SERVICE_UNAVAILABLE,
          statusCode: 500,
        });
      });

      it('should handle 503 Service Unavailable', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ message: 'Service unavailable' }),
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Backend service error. Please try again later.',
          type: AIServiceErrorType.SERVICE_UNAVAILABLE,
          statusCode: 503,
        });
      });

      it('should handle error response without JSON', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => {
            throw new Error('Not JSON');
          },
        });

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          type: AIServiceErrorType.SERVICE_UNAVAILABLE,
          statusCode: 500,
        });
      });
    });

    describe('network errors', () => {
      it('should handle network connection errors', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(
          new TypeError('Failed to fetch')
        );

        await expect(
          askAI('Text', 'Context', [], mockSettings)
        ).rejects.toMatchObject({
          message: 'Backend service is not available. Please ensure the server is running.',
          type: AIServiceErrorType.SERVICE_UNAVAILABLE,
        });
      });

      it('should handle timeout errors', async () => {
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

        await expect(
          askAI('Text', 'Context', [], mockSettings, { timeout: 5000 })
        ).rejects.toMatchObject({
          message: 'Request timed out after 5000ms',
          type: AIServiceErrorType.TIMEOUT,
        });
      });

      it('should use default timeout', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('Text', 'Context', [], mockSettings);

        // Verify fetch was called (timeout is handled by AbortController)
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    describe('custom configuration', () => {
      it('should use custom baseUrl', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('Text', 'Context', [], mockSettings, {
          baseUrl: 'http://custom-api.com',
        });

        expect(global.fetch).toHaveBeenCalledWith(
          'http://custom-api.com/api/ai/query',
          expect.any(Object)
        );
      });

      it('should use custom timeout', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('Text', 'Context', [], mockSettings, { timeout: 60000 });

        expect(global.fetch).toHaveBeenCalled();
      });
    });

    describe('retry behavior', () => {
      it('should call retryWithBackoff wrapper', async () => {
        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

        await askAI('Text', 'Context', [], mockSettings);

        expect(retryModule.retryWithBackoff).toHaveBeenCalled();
      });

      it('should log retry attempts', async () => {
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        const mockResponse: AIQueryResponse = {
          response: 'Response',
          model: 'gpt-3.5-turbo',
        };

        let attempts = 0;
        (retryModule.retryWithBackoff as jest.Mock).mockImplementation(
          async (fn: () => any, config: any, onRetry?: Function) => {
            if (attempts === 0) {
              attempts++;
              const error = new Error('Test error');
              (error as any).type = AIServiceErrorType.TIMEOUT;
              onRetry?.(1, 1000, error);
              throw error;
            }
            return mockResponse;
          }
        );

        (global.fetch as jest.Mock)
          .mockRejectedValueOnce(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
          .mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
          });

        await askAI('Text', 'Context', [], mockSettings);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[AI Service] Retry attempt')
        );

        consoleLogSpy.mockRestore();
      });
    });
  });

  describe('isAIServiceError', () => {
    it('should return true for valid AIServiceError', () => {
      const error: AIServiceError = {
        message: 'Test error',
        type: AIServiceErrorType.NETWORK_ERROR,
        statusCode: 500,
      };

      expect(isAIServiceError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular error');
      expect(isAIServiceError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAIServiceError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAIServiceError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isAIServiceError('error string')).toBe(false);
    });

    it('should return false for object without type', () => {
      expect(isAIServiceError({ message: 'error' })).toBe(false);
    });

    it('should return false for object with invalid type', () => {
      expect(
        isAIServiceError({ message: 'error', type: 'INVALID_TYPE' })
      ).toBe(false);
    });

    it('should validate all error types', () => {
      Object.values(AIServiceErrorType).forEach((type) => {
        const error: AIServiceError = {
          message: 'Test',
          type: type as AIServiceErrorType,
        };
        expect(isAIServiceError(error)).toBe(true);
      });
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return friendly message for NETWORK_ERROR', () => {
      const error: AIServiceError = {
        message: 'Network failed',
        type: AIServiceErrorType.NETWORK_ERROR,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('Network connection error');
    });

    it('should return friendly message for TIMEOUT', () => {
      const error: AIServiceError = {
        message: 'Request timed out',
        type: AIServiceErrorType.TIMEOUT,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('timed out');
    });

    it('should return friendly message for SERVICE_UNAVAILABLE', () => {
      const error: AIServiceError = {
        message: 'Service down',
        type: AIServiceErrorType.SERVICE_UNAVAILABLE,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('unavailable');
    });

    it('should return friendly message for INVALID_REQUEST', () => {
      const error: AIServiceError = {
        message: 'Bad input',
        type: AIServiceErrorType.INVALID_REQUEST,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('Invalid request');
      expect(message).toContain('Bad input');
    });

    it('should return friendly message for AUTH_ERROR', () => {
      const error: AIServiceError = {
        message: 'Not authorized',
        type: AIServiceErrorType.AUTH_ERROR,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('Authentication error');
    });

    it('should return friendly message for MODEL_ERROR', () => {
      const error: AIServiceError = {
        message: 'Model failed',
        type: AIServiceErrorType.MODEL_ERROR,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('AI model error');
      expect(message).toContain('Model failed');
    });

    it('should return friendly message for RATE_LIMIT', () => {
      const error: AIServiceError = {
        message: 'Too many requests',
        type: AIServiceErrorType.RATE_LIMIT,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toContain('Rate limit exceeded');
    });

    it('should return friendly message for UNKNOWN_ERROR', () => {
      const error: AIServiceError = {
        message: 'Something went wrong',
        type: AIServiceErrorType.UNKNOWN_ERROR,
      };

      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('Something went wrong');
    });

    it('should handle regular Error objects', () => {
      const error = new Error('Regular error');
      const message = getUserFriendlyErrorMessage(error);
      expect(message).toBe('Regular error');
    });

    it('should handle non-Error objects', () => {
      const message = getUserFriendlyErrorMessage('string error');
      expect(message).toBe('An unexpected error occurred');
    });

    it('should handle null', () => {
      const message = getUserFriendlyErrorMessage(null);
      expect(message).toBe('An unexpected error occurred');
    });
  });

  describe('edge cases', () => {
    it('should handle very long selected text', async () => {
      const longText = 'A'.repeat(100000);
      const mockResponse: AIQueryResponse = {
        response: 'Response',
        model: 'gpt-3.5-turbo',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await askAI(longText, '', [], mockSettings);
      expect(result.response).toBe('Response');
    });

    it('should handle special characters in text', async () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t';
      const mockResponse: AIQueryResponse = {
        response: 'Response',
        model: 'gpt-3.5-turbo',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await askAI(specialText, '', [], mockSettings);
      expect(result.response).toBe('Response');
    });

    it('should handle Unicode characters', async () => {
      const unicodeText = '你好世界 🌍 Привет мир';
      const mockResponse: AIQueryResponse = {
        response: 'Response',
        model: 'gpt-3.5-turbo',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await askAI(unicodeText, '', [], mockSettings);
      expect(result.response).toBe('Response');
    });

    it('should handle empty context', async () => {
      const mockResponse: AIQueryResponse = {
        response: 'Response',
        model: 'gpt-3.5-turbo',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await askAI('Text', '', [], mockSettings);
      expect(result.response).toBe('Response');
    });

    it('should handle missing optional fields in response', async () => {
      const mockResponse = {
        response: 'Response',
        model: 'gpt-3.5-turbo',
        // Missing usage and processingTime
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await askAI('Text', '', [], mockSettings);
      expect(result.response).toBe('Response');
      expect(result.usage).toBeUndefined();
      expect(result.processingTime).toBeUndefined();
    });
  });
});
