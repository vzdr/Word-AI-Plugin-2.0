/**
 * Error Types for Word AI Plugin Backend
 *
 * Defines structured error types and responses for the API
 */

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
  };
}

/**
 * Error codes used throughout the application
 */
export enum ErrorCode {
  // General errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // AI service errors
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',

  // File upload errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',

  // Parser errors
  PARSER_ERROR = 'PARSER_ERROR',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  PASSWORD_PROTECTED = 'PASSWORD_PROTECTED',
  PARSER_TIMEOUT = 'PARSER_TIMEOUT',
  EXTRACTION_ERROR = 'EXTRACTION_ERROR',
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = ErrorCode.INTERNAL_SERVER_ERROR,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Convert error to ErrorResponse format
   */
  toErrorResponse(): ErrorResponse {
    return {
      error: {
        message: this.message,
        code: this.code,
        details: this.details,
      },
    };
  }
}

/**
 * Validation error class
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: any) {
    super(message, 404, ErrorCode.NOT_FOUND, details);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized error class
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 401, ErrorCode.UNAUTHORIZED, details);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden error class
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, ErrorCode.FORBIDDEN, details);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * AI service error class
 */
export class AIServiceError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 503, ErrorCode.AI_SERVICE_ERROR, details);
    Object.setPrototypeOf(this, AIServiceError.prototype);
  }
}

/**
 * Parser error class - base class for all parser-related errors
 */
export class ParserError extends AppError {
  constructor(message: string, code: string = ErrorCode.PARSER_ERROR, details?: any) {
    super(message, 500, code, details);
    Object.setPrototypeOf(this, ParserError.prototype);
  }
}

/**
 * Unsupported file type error
 */
export class UnsupportedFileTypeError extends ParserError {
  constructor(fileType: string, details?: any) {
    super(`Unsupported file type: ${fileType}`, ErrorCode.UNSUPPORTED_FILE_TYPE, details);
    Object.setPrototypeOf(this, UnsupportedFileTypeError.prototype);
  }
}

/**
 * Corrupted file error
 */
export class FileCorruptedError extends ParserError {
  constructor(message: string = 'File is corrupted or invalid', details?: any) {
    super(message, ErrorCode.FILE_CORRUPTED, details);
    Object.setPrototypeOf(this, FileCorruptedError.prototype);
  }
}

/**
 * Password protected file error
 */
export class PasswordProtectedError extends ParserError {
  constructor(message: string = 'File is password protected', details?: any) {
    super(message, ErrorCode.PASSWORD_PROTECTED, details);
    Object.setPrototypeOf(this, PasswordProtectedError.prototype);
  }
}

/**
 * Parser timeout error
 */
export class ParserTimeoutError extends ParserError {
  constructor(message: string = 'Parser operation timed out', details?: any) {
    super(message, ErrorCode.PARSER_TIMEOUT, details);
    Object.setPrototypeOf(this, ParserTimeoutError.prototype);
  }
}

/**
 * Extraction error - when text/data extraction fails
 */
export class ExtractionError extends ParserError {
  constructor(message: string = 'Failed to extract content from file', details?: any) {
    super(message, ErrorCode.EXTRACTION_ERROR, details);
    Object.setPrototypeOf(this, ExtractionError.prototype);
  }
}
