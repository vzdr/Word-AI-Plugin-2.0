/**
 * Error Handling Middleware for Word AI Plugin Backend
 *
 * Provides centralized error handling with structured JSON responses
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorResponse, ErrorCode } from '../types/errors';

/**
 * Global error handling middleware
 * Must be registered after all routes
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error for debugging (in production, use proper logging service)
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // Handle AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toErrorResponse());
    return;
  }

  // Handle express-validator errors
  if (err.name === 'ValidationError') {
    const errorResponse: ErrorResponse = {
      error: {
        message: err.message,
        code: ErrorCode.VALIDATION_ERROR,
        details: err,
      },
    };
    res.status(400).json(errorResponse);
    return;
  }

  // Handle syntax errors (invalid JSON)
  if (err instanceof SyntaxError && 'body' in err) {
    const errorResponse: ErrorResponse = {
      error: {
        message: 'Invalid JSON in request body',
        code: ErrorCode.BAD_REQUEST,
      },
    };
    res.status(400).json(errorResponse);
    return;
  }

  // Handle unknown errors
  const errorResponse: ErrorResponse = {
    error: {
      message: 'An unexpected error occurred',
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      // Only include details in development
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    },
  };

  res.status(500).json(errorResponse);
};

/**
 * 404 Not Found handler
 * Should be registered after all routes but before error handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errorResponse: ErrorResponse = {
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: ErrorCode.NOT_FOUND,
    },
  };

  res.status(404).json(errorResponse);
};

/**
 * Async route wrapper to catch async errors
 * Use this to wrap async route handlers to avoid try-catch blocks
 *
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
