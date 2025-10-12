/**
 * Request Validation Middleware for Word AI Plugin Backend
 *
 * Provides validation utilities using express-validator
 */

import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain, ValidationError as ExpressValidationError } from 'express-validator';
import { ValidationError } from '../types/errors';

/**
 * Middleware to check validation results and return structured errors
 *
 * Should be used after express-validator validation chains
 *
 * @example
 * router.post('/api/query',
 *   body('text').notEmpty().withMessage('Text is required'),
 *   body('context').optional().isString(),
 *   validateRequest,
 *   queryController
 * );
 */
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error: ExpressValidationError) => {
      if (error.type === 'field') {
        return {
          field: error.path,
          message: error.msg,
          value: error.value,
        };
      }
      return {
        message: error.msg,
      };
    });

    throw new ValidationError('Validation failed', formattedErrors);
  }

  next();
};

/**
 * Custom validation helper: Validate file upload
 *
 * @param maxSizeMB Maximum file size in megabytes
 * @param allowedTypes Array of allowed MIME types
 */
export const validateFile = (
  maxSizeMB: number = 10,
  allowedTypes: string[] = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.file) {
      next();
      return;
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    // Check file size
    if (req.file.size > maxSizeBytes) {
      throw new ValidationError(
        `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
        {
          maxSize: maxSizeMB,
          actualSize: (req.file.size / (1024 * 1024)).toFixed(2),
        }
      );
    }

    // Check file type
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new ValidationError(
        'Invalid file type',
        {
          allowedTypes,
          actualType: req.file.mimetype,
        }
      );
    }

    next();
  };
};

/**
 * Utility function to create a validation chain array
 * This helps organize validation rules in route definitions
 *
 * @example
 * const queryValidation = createValidation([
 *   body('text').notEmpty().withMessage('Text is required'),
 *   body('context').optional().isString()
 * ]);
 *
 * router.post('/api/query', queryValidation, validateRequest, queryController);
 */
export const createValidation = (validations: ValidationChain[]) => {
  return validations;
};

/**
 * Common validation chains for reuse
 */
export const commonValidations = {
  /**
   * Validate pagination parameters
   */
  pagination: [
    // query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    // query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  ],

  /**
   * Validate text input (for AI queries)
   */
  textInput: [
    // body('text').notEmpty().withMessage('Text is required').isString().withMessage('Text must be a string'),
  ],
};

/**
 * Sanitization helper
 * Removes potentially dangerous characters from input
 */
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';

  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .substring(0, 10000); // Limit length to prevent DoS
};
