import * as React from 'react';
import styles from './LoadingIndicator.module.css';

export interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  retryCount?: number;
  maxRetries?: number;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Processing your request...',
  size = 'medium',
  retryCount,
  maxRetries
}) => {
  // Determine the display message based on retry state
  const displayMessage = React.useMemo(() => {
    if (retryCount && retryCount > 0 && maxRetries) {
      return `Retrying... (attempt ${retryCount} of ${maxRetries})`;
    }
    return message;
  }, [message, retryCount, maxRetries]);

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={`${styles.spinner} ${styles[`spinner-${size}`]}`}>
        <div className={styles.spinnerInner}></div>
      </div>
      {displayMessage && (
        <p className={styles.message}>
          {displayMessage}
        </p>
      )}
    </div>
  );
};

export default LoadingIndicator;
