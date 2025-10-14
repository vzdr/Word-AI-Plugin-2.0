/**
 * AI Service API Client
 *
 * Handles communication with the backend AI service for text generation.
 * Provides error handling, timeout management, retry logic, and request/response typing.
 */

import { SettingsValues } from '../taskpane/components/Settings';
import { UploadedFile } from '../taskpane/components/FileUpload';
import { retryWithBackoff, RetryConfig, shouldRetryError } from '../utils/retry';

/**
 * Configuration for AI service requests
 */
export interface AIServiceConfig {
  /**
   * Base URL for the backend API
   * @default 'http://localhost:3001'
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Request payload for AI query
 */
export interface AIQueryRequest {
  /**
   * The selected text from the Word document
   */
  selectedText: string;

  /**
   * Inline context provided by the user
   */
  inlineContext?: string;

  /**
   * Uploaded files for context
   */
  files?: Array<{
    id: string;
    name: string;
    size: number;
    type: string;
    extension: string;
    content?: string; // Base64 encoded content
  }>;

  /**
   * AI model settings
   */
  settings: SettingsValues;
}

/**
 * Response from AI service
 */
export interface AIQueryResponse {
  /**
   * Generated text response from AI
   */
  response: string;

  /**
   * Model used for generation
   */
  model: string;

  /**
   * Token count information
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Processing time in milliseconds
   */
  processingTime?: number;
}

/**
 * Error response from AI service
 */
export interface AIServiceError {
  /**
   * Error message
   */
  message: string;

  /**
   * Error type for categorization
   */
  type: AIServiceErrorType;

  /**
   * HTTP status code if applicable
   */
  statusCode?: number;

  /**
   * Additional error details
   */
  details?: any;
}

/**
 * Types of AI service errors
 */
export enum AIServiceErrorType {
  /** Network/connection error */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /** Request timeout */
  TIMEOUT = 'TIMEOUT',

  /** Backend service unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  /** Invalid request data */
  INVALID_REQUEST = 'INVALID_REQUEST',

  /** Authentication/authorization error */
  AUTH_ERROR = 'AUTH_ERROR',

  /** AI model error */
  MODEL_ERROR = 'MODEL_ERROR',

  /** Rate limit exceeded */
  RATE_LIMIT = 'RATE_LIMIT',

  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<AIServiceConfig> = {
  baseUrl: 'http://localhost:3001',
  timeout: 30000,
};

/**
 * Retry configuration for AI service requests
 * Retries transient failures: rate limits (429), timeouts, 503 errors
 * Does NOT retry: 400, 401, 404, 422 (client errors)
 */
const AI_SERVICE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  shouldRetry: (error: Error) => {
    // Check for AIServiceError with specific error types
    if (isAIServiceError(error)) {
      // Retry transient errors
      if (
        error.type === AIServiceErrorType.TIMEOUT ||
        error.type === AIServiceErrorType.NETWORK_ERROR ||
        error.type === AIServiceErrorType.SERVICE_UNAVAILABLE ||
        error.type === AIServiceErrorType.RATE_LIMIT
      ) {
        return true;
      }

      // Do NOT retry client errors
      if (
        error.type === AIServiceErrorType.INVALID_REQUEST ||
        error.type === AIServiceErrorType.AUTH_ERROR
      ) {
        return false;
      }
    }

    // Fall back to generic retry logic for other errors
    return shouldRetryError(error);
  },
};

/**
 * Send AI query to backend service (internal implementation without retry)
 *
 * @param selectedText - The text selected in Word document
 * @param context - Inline context provided by user
 * @param files - Array of uploaded files for additional context
 * @param settings - AI model settings (model, temperature, maxTokens)
 * @param config - Optional service configuration
 * @returns Promise resolving to AI response
 * @throws AIServiceError on failure
 * @private
 */
async function askAIInternal(
  selectedText: string,
  context: string = '',
  files: UploadedFile[] = [],
  settings: SettingsValues,
  config: AIServiceConfig = {}
): Promise<AIQueryResponse> {
  const serviceConfig = { ...DEFAULT_CONFIG, ...config };
  const apiUrl = `${serviceConfig.baseUrl}/api/ai/query`;

  // Validate input
  if (!selectedText || selectedText.trim().length === 0) {
    throw createError(
      'Selected text is required',
      AIServiceErrorType.INVALID_REQUEST
    );
  }

  // Prepare request payload
  const requestPayload: AIQueryRequest = {
    selectedText,
    inlineContext: context,
    files: await prepareFilesForRequest(files),
    settings,
  };

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), serviceConfig.timeout);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      await handleHttpError(response);
    }

    // Parse response
    const data: AIQueryResponse = await response.json();

    // Validate response format
    if (!data.response || typeof data.response !== 'string') {
      throw createError(
        'Invalid response format from server',
        AIServiceErrorType.UNKNOWN_ERROR
      );
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw createError(
        `Request timed out after ${serviceConfig.timeout}ms`,
        AIServiceErrorType.TIMEOUT
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw createError(
        'Backend service is not available. Please ensure the server is running.',
        AIServiceErrorType.SERVICE_UNAVAILABLE
      );
    }

    // Re-throw if already an AIServiceError
    if (isAIServiceError(error)) {
      throw error;
    }

    // Handle unknown errors
    throw createError(
      `Failed to process AI request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      AIServiceErrorType.UNKNOWN_ERROR,
      undefined,
      error
    );
  }
}

/**
 * Send AI query to backend service with automatic retry
 *
 * This is the public API that wraps askAIInternal with retry logic.
 * Automatically retries transient failures (timeouts, 503, 429) with exponential backoff.
 * Does NOT retry permanent errors (400, 401, 404).
 *
 * @param selectedText - The text selected in Word document
 * @param context - Inline context provided by user
 * @param files - Array of uploaded files for additional context
 * @param settings - AI model settings (model, temperature, maxTokens)
 * @param config - Optional service configuration
 * @returns Promise resolving to AI response
 * @throws AIServiceError on failure (after all retry attempts exhausted)
 *
 * @example
 * ```typescript
 * try {
 *   const response = await askAI(
 *     'Selected text',
 *     'Context information',
 *     [],
 *     { model: 'gpt-3.5-turbo', temperature: 0.7, maxTokens: 2000 }
 *   );
 *   console.log(response.response);
 * } catch (error) {
 *   if (isAIServiceError(error)) {
 *     console.error(`Error type: ${error.type}, Message: ${error.message}`);
 *   }
 * }
 * ```
 */
export async function askAI(
  selectedText: string,
  context: string = '',
  files: UploadedFile[] = [],
  settings: SettingsValues,
  config: AIServiceConfig = {}
): Promise<AIQueryResponse> {
  return retryWithBackoff(
    () => askAIInternal(selectedText, context, files, settings, config),
    AI_SERVICE_RETRY_CONFIG,
    (attempt, delay, error) => {
      // Log retry attempts
      console.log(
        `[AI Service] Retry attempt ${attempt}/${AI_SERVICE_RETRY_CONFIG.maxAttempts} ` +
        `after ${delay}ms delay. Error: ${error.message}`
      );
    }
  );
}

/**
 * Prepare uploaded files for API request
 * Converts File objects to base64-encoded strings
 */
async function prepareFilesForRequest(
  files: UploadedFile[]
): Promise<AIQueryRequest['files']> {
  if (!files || files.length === 0) {
    return undefined;
  }

  const preparedFiles = await Promise.all(
    files.map(async (uploadedFile) => {
      let content: string | undefined;

      // Read file content if File object is available
      if (uploadedFile.file) {
        try {
          content = await readFileAsBase64(uploadedFile.file);
        } catch (error) {
          console.error(`Failed to read file ${uploadedFile.name}:`, error);
          // Continue without content rather than failing entire request
        }
      }

      return {
        id: uploadedFile.id,
        name: uploadedFile.name,
        size: uploadedFile.size,
        type: uploadedFile.type,
        extension: uploadedFile.extension,
        content,
      };
    })
  );

  return preparedFiles;
}

/**
 * Read file as base64 string
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:text/plain;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Handle HTTP error responses
 */
async function handleHttpError(response: Response): Promise<never> {
  let errorMessage = `Request failed with status ${response.status}`;
  let errorType = AIServiceErrorType.UNKNOWN_ERROR;
  let details: any;

  // Try to parse error response
  try {
    const errorData = await response.json();
    errorMessage = errorData.message || errorData.error || errorMessage;
    details = errorData;
  } catch {
    // If response is not JSON, use status text
    errorMessage = response.statusText || errorMessage;
  }

  // Categorize error by status code
  switch (response.status) {
    case 400:
      errorType = AIServiceErrorType.INVALID_REQUEST;
      break;
    case 401:
    case 403:
      errorType = AIServiceErrorType.AUTH_ERROR;
      break;
    case 429:
      errorType = AIServiceErrorType.RATE_LIMIT;
      errorMessage = 'Rate limit exceeded. Please try again later.';
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      errorType = AIServiceErrorType.SERVICE_UNAVAILABLE;
      errorMessage = 'Backend service error. Please try again later.';
      break;
    default:
      errorType = AIServiceErrorType.UNKNOWN_ERROR;
  }

  throw createError(errorMessage, errorType, response.status, details);
}

/**
 * Create an AIServiceError object
 */
function createError(
  message: string,
  type: AIServiceErrorType,
  statusCode?: number,
  details?: any
): AIServiceError {
  return {
    message,
    type,
    statusCode,
    details,
  };
}

/**
 * Type guard to check if an error is an AIServiceError
 *
 * @param error - Error to check
 * @returns True if error is an AIServiceError
 *
 * @example
 * ```typescript
 * catch (error) {
 *   if (isAIServiceError(error)) {
 *     console.log(`Error type: ${error.type}`);
 *   }
 * }
 * ```
 */
export function isAIServiceError(error: any): error is AIServiceError {
  return (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    'type' in error &&
    Object.values(AIServiceErrorType).includes(error.type)
  );
}

/**
 * Get user-friendly error message for display
 *
 * @param error - AIServiceError or unknown error
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * catch (error) {
 *   const message = getUserFriendlyErrorMessage(error);
 *   alert(message);
 * }
 * ```
 */
export function getUserFriendlyErrorMessage(error: any): string {
  if (!isAIServiceError(error)) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
  }

  switch (error.type) {
    case AIServiceErrorType.NETWORK_ERROR:
      return 'Network connection error. Please check your internet connection.';

    case AIServiceErrorType.TIMEOUT:
      return 'Request timed out. The AI service is taking too long to respond. Please try again.';

    case AIServiceErrorType.SERVICE_UNAVAILABLE:
      return 'AI service is currently unavailable. Please ensure the backend server is running and try again.';

    case AIServiceErrorType.INVALID_REQUEST:
      return `Invalid request: ${error.message}`;

    case AIServiceErrorType.AUTH_ERROR:
      return 'Authentication error. Please check your credentials.';

    case AIServiceErrorType.MODEL_ERROR:
      return `AI model error: ${error.message}`;

    case AIServiceErrorType.RATE_LIMIT:
      return 'Rate limit exceeded. Please wait a moment and try again.';

    default:
      return error.message || 'An error occurred while processing your request.';
  }
}
