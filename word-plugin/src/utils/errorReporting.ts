/**
 * Error Reporting Infrastructure
 *
 * Provides error reporting and tracking capabilities:
 * - Captures error details with context
 * - Records user agent and timestamp
 * - Can be extended with external reporting services (Sentry, etc.)
 * - Logs to console in development
 * - Prepares for production error tracking
 */

import { logger } from './logger';

export interface ErrorReport {
  message: string;
  stack?: string;
  context?: Record<string, any>;
  timestamp: Date;
  userAgent?: string;
  url?: string;
  appVersion?: string;
}

interface ErrorReportingConfig {
  enabled: boolean;
  reportToExternal: boolean;
  externalEndpoint?: string;
  appVersion?: string;
}

// Global configuration
let config: ErrorReportingConfig = {
  enabled: true,
  reportToExternal: false,
  appVersion: '1.0.0'
};

/**
 * Configure error reporting settings
 */
export function configureErrorReporting(options: Partial<ErrorReportingConfig>): void {
  config = { ...config, ...options };
  logger.info('Error reporting configured', { config });
}

/**
 * Report an error with context
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  if (!config.enabled) {
    return;
  }

  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    appVersion: config.appVersion
  };

  // Log to console
  logger.error('Error reported', error, {
    ...context,
    userAgent: report.userAgent,
    url: report.url,
    appVersion: report.appVersion
  });

  // Send to external service if configured
  if (config.reportToExternal && config.externalEndpoint) {
    sendToExternalService(report);
  }
}

/**
 * Report a custom error message with context
 */
export function reportErrorMessage(message: string, context?: Record<string, any>): void {
  const error = new Error(message);
  reportError(error, context);
}

/**
 * Setup global error handlers
 */
export function setupErrorReporting(): void {
  // Handle unhandled promise rejections
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));

      reportError(error, {
        type: 'unhandledRejection',
        promise: event.promise
      });

      logger.error('Unhandled promise rejection', error, {
        reason: event.reason
      });
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message);

      reportError(error, {
        type: 'uncaughtError',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });

      logger.error('Uncaught error', error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    logger.info('Global error handlers registered');
  }
}

/**
 * Send error report to external service
 * This is a placeholder for integration with services like Sentry, Rollbar, etc.
 */
async function sendToExternalService(report: ErrorReport): Promise<void> {
  if (!config.externalEndpoint) {
    return;
  }

  try {
    // Example implementation - replace with actual service integration
    const response = await fetch(config.externalEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(report)
    });

    if (!response.ok) {
      logger.warn('Failed to send error report to external service', {
        status: response.status,
        statusText: response.statusText
      });
    } else {
      logger.debug('Error report sent to external service', { report });
    }
  } catch (error) {
    // Don't let error reporting failures crash the app
    logger.warn('Error sending report to external service', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Create a wrapper for async functions that automatically reports errors
 */
export function withErrorReporting<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: Record<string, any>
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(
        error instanceof Error ? error : new Error(String(error)),
        {
          ...context,
          functionName: fn.name,
          arguments: args
        }
      );
      throw error;
    }
  }) as T;
}

/**
 * Manually capture and report a caught error
 */
export function captureError(error: Error | unknown, context?: Record<string, any>): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  reportError(errorObj, context);
}

/**
 * Get error reporting configuration
 */
export function getErrorReportingConfig(): ErrorReportingConfig {
  return { ...config };
}

// Initialize error reporting on module load
setupErrorReporting();
