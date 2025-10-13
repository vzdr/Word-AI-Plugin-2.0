import * as React from 'react';
import styles from './ErrorDisplay.module.css';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorDisplayProps {
  error: string | Error;
  severity?: ErrorSeverity;
  dismissible?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  severity = 'error',
  dismissible = true,
  onDismiss,
  onRetry
}) => {
  const errorMessage = typeof error === 'string' ? error : error.message;

  const getIcon = (): string => {
    switch (severity) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '❌';
    }
  };

  const getSeverityClass = (): string => {
    return styles[`container-${severity}`];
  };

  return (
    <div
      className={`${styles.container} ${getSeverityClass()}`}
      role="alert"
      aria-live="assertive"
    >
      <div className={styles.content}>
        <span className={styles.icon} aria-hidden="true">
          {getIcon()}
        </span>
        <div className={styles.messageContainer}>
          <p className={styles.message}>{errorMessage}</p>
          {onRetry && (
            <button
              type="button"
              className={styles.retryButton}
              onClick={onRetry}
              aria-label="Retry"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss error"
          title="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default ErrorDisplay;
