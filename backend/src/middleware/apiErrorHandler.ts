/**
 * API Error Handler Middleware
 *
 * Comprehensive error handling for API endpoints with:
 * - Custom error types
 * - Structured error responses
 * - HTTP status code mapping
 * - Error logging
 * - Production vs development modes
 */

import { Request, Response, NextFunction } from 'express';
import { AIServiceError, AIErrorType } from '../types/ai';

/**
 * API Error class for custom API errors
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errorCode?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Validation Error class
 */
export class ValidationError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Structured error response interface
 */
interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  errorCode?: string;
  details?: any;
  timestamp: string;
  path?: string;
  stack?: string;
}

/**
 * Map AI error types to HTTP status codes
 */
function mapAIErrorToStatusCode(errorType: AIErrorType): number {
  const statusCodeMap: Record<AIErrorType, number> = {
    [AIErrorType.INVALID_REQUEST]: 400,
    [AIErrorType.AUTHENTICATION]: 401,
    [AIErrorType.INSUFFICIENT_QUOTA]: 403,
    [AIErrorType.RATE_LIMIT]: 429,
    [AIErrorType.TIMEOUT]: 408,
    [AIErrorType.CONTEXT_TOO_LARGE]: 413,
    [AIErrorType.INVALID_MODEL]: 400,
    [AIErrorType.API_ERROR]: 502,
    [AIErrorType.UNKNOWN]: 500,
  };

  return statusCodeMap[errorType] || 500;
}

/**
 * Map AI error types to error codes
 */
function mapAIErrorToCode(errorType: AIErrorType): string {
  const codeMap: Record<AIErrorType, string> = {
    [AIErrorType.INVALID_REQUEST]: 'INVALID_REQUEST',
    [AIErrorType.AUTHENTICATION]: 'AUTHENTICATION_FAILED',
    [AIErrorType.INSUFFICIENT_QUOTA]: 'QUOTA_EXCEEDED',
    [AIErrorType.RATE_LIMIT]: 'RATE_LIMIT_EXCEEDED',
    [AIErrorType.TIMEOUT]: 'REQUEST_TIMEOUT',
    [AIErrorType.CONTEXT_TOO_LARGE]: 'CONTEXT_TOO_LARGE',
    [AIErrorType.INVALID_MODEL]: 'INVALID_MODEL',
    [AIErrorType.API_ERROR]: 'API_ERROR',
    [AIErrorType.UNKNOWN]: 'UNKNOWN_ERROR',
  };

  return codeMap[errorType] || 'UNKNOWN_ERROR';
}

/**
 * Build structured error response
 */
function buildErrorResponse(
  error: Error,
  statusCode: number,
  errorCode: string,
  req: Request,
  includeStack: boolean = false
): ErrorResponse {
  const response: ErrorResponse = {
    error: error.name || 'Error',
    message: error.message || 'An error occurred',
    statusCode,
    errorCode,
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  // Add details if available
  if (error instanceof APIError && error.details) {
    response.details = error.details;
  }

  // Include stack trace in development
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Log error with appropriate level
 */
function logError(error: Error, statusCode: number, req: Request): void {
  const logData = {
    error: error.name,
    message: error.message,
    statusCode,
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
  };

  // Log at different levels based on status code
  if (statusCode >= 500) {
    console.error('[API Error - Server]', logData);
    if (error.stack) {
      console.error('[Stack Trace]', error.stack);
    }
  } else if (statusCode >= 400) {
    console.warn('[API Error - Client]', logData);
  }
}

/**
 * Main error handler middleware
 *
 * Handles all types of errors and returns consistent JSON responses
 */
export const apiErrorHandler = (
  error: Error | APIError | AIServiceError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let errorResponse: ErrorResponse;

  // Handle AIServiceError (from OpenAI service)
  if (error instanceof AIServiceError) {
    statusCode = error.statusCode || mapAIErrorToStatusCode(error.type);
    errorCode = mapAIErrorToCode(error.type);
    errorResponse = buildErrorResponse(error, statusCode, errorCode, req, isDevelopment);

    // Add original error details in development
    if (isDevelopment && error.originalError) {
      errorResponse.details = {
        ...errorResponse.details,
        originalError: error.originalError.message || String(error.originalError),
      };
    }
  }
  // Handle custom APIError
  else if (error instanceof APIError) {
    statusCode = error.statusCode;
    errorCode = error.errorCode || 'API_ERROR';
    errorResponse = buildErrorResponse(error, statusCode, errorCode, req, isDevelopment);
  }
  // Handle generic errors
  else {
    errorResponse = buildErrorResponse(error, statusCode, errorCode, req, isDevelopment);
  }

  // Log the error
  logError(error, statusCode, req);

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const error = new APIError(
    `Route not found: ${req.method} ${req.path}`,
    404,
    'NOT_FOUND'
  );

  const errorResponse: ErrorResponse = {
    error: 'Not Found',
    message: error.message,
    statusCode: 404,
    errorCode: 'NOT_FOUND',
    timestamp: new Date().toISOString(),
    path: req.path,
  };

  res.status(404).json(errorResponse);
};

/**
 * Async error wrapper
 *
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Timeout handler
 *
 * Middleware to enforce request timeout
 */
export const timeoutHandler = (timeoutMs: number = 30000) => {
  return (_req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new APIError(
          'Request timeout',
          408,
          'REQUEST_TIMEOUT',
          { timeout: timeoutMs }
        );
        next(error);
      }
    }, timeoutMs);

    // Clear timeout when response is sent
    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    next();
  };
};

/**
 * Request size limit error handler
 */
export const requestSizeLimitHandler = (
  error: any,
  _req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (error.type === 'entity.too.large') {
    const apiError = new APIError(
      'Request body too large',
      413,
      'PAYLOAD_TOO_LARGE',
      { limit: error.limit }
    );
    next(apiError);
  } else {
    next(error);
  }
};

/**
 * Export error types for use in other modules
 */
export default {
  apiErrorHandler,
  notFoundHandler,
  asyncHandler,
  timeoutHandler,
  requestSizeLimitHandler,
  APIError,
  ValidationError,
};
