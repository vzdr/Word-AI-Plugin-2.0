/**
 * Logger Utility
 *
 * Comprehensive logging system with:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR)
 * - Configurable log level filtering
 * - Context object support
 * - Error stack trace support
 * - Colored console output (in supported environments)
 * - Production-friendly (respects log level)
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, any>;
  error?: Error;
}

/**
 * Logger class for structured application logging
 */
class Logger {
  private currentLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private maxLogHistory = 100;

  constructor() {
    // Set log level from environment or default to INFO
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      this.currentLevel = LogLevel.DEBUG;
    }
  }

  /**
   * Set the minimum log level to display
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Log a debug message (for internal state, detailed information)
   */
  debug(message: string, context?: any): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message (for user actions, successful operations)
   */
  info(message: string, context?: any): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message (for validation failures, deprecations)
   */
  warn(message: string, context?: any): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message (for exceptions, API failures)
   */
  error(message: string, error?: Error, context?: any): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, message: string, context?: any, error?: Error): void {
    // Filter by log level
    if (level < this.currentLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error
    };

    // Store in history
    this.logs.push(entry);
    if (this.logs.length > this.maxLogHistory) {
      this.logs.shift();
    }

    // Output to console
    this.outputToConsole(entry);
  }

  /**
   * Output log entry to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelName}]`;

    // Choose console method and styling based on level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`%c${prefix} ${entry.message}`, 'color: gray', entry.context || '');
        break;
      case LogLevel.INFO:
        console.info(`%c${prefix} ${entry.message}`, 'color: blue', entry.context || '');
        break;
      case LogLevel.WARN:
        console.warn(`%c${prefix} ${entry.message}`, 'color: orange', entry.context || '');
        break;
      case LogLevel.ERROR:
        console.error(`%c${prefix} ${entry.message}`, 'color: red', entry.context || '');
        if (entry.error) {
          console.error('Error details:', entry.error);
          if (entry.error.stack) {
            console.error('Stack trace:', entry.error.stack);
          }
        }
        break;
    }

    // Log context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      console.log('Context:', entry.context);
    }
  }

  /**
   * Get recent log history
   */
  getHistory(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.logs = [];
  }

  /**
   * Get log entries filtered by level
   */
  getByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(entry => entry.level === level);
  }

  /**
   * Export logs as JSON for debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export helper functions for common patterns
export const logAsyncOperation = {
  start: (operation: string, context?: any) => {
    logger.debug(`Starting: ${operation}`, context);
  },
  success: (operation: string, context?: any) => {
    logger.info(`Success: ${operation}`, context);
  },
  failure: (operation: string, error: Error, context?: any) => {
    logger.error(`Failed: ${operation}`, error, context);
  }
};

export const logUserAction = (action: string, context?: any) => {
  logger.info(`User action: ${action}`, context);
};

export const logValidation = {
  pass: (validation: string, context?: any) => {
    logger.debug(`Validation passed: ${validation}`, context);
  },
  fail: (validation: string, context?: any) => {
    logger.warn(`Validation failed: ${validation}`, context);
  }
};
