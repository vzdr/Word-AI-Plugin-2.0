import * as React from 'react';
import styles from './LoadingIndicator.module.css';

export interface LoadingIndicatorProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  message = 'Processing your request...',
  size = 'medium'
}) => {
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={`${styles.spinner} ${styles[`spinner-${size}`]}`}>
        <div className={styles.spinnerInner}></div>
      </div>
      {message && (
        <p className={styles.message}>
          {message}
        </p>
      )}
    </div>
  );
};

export default LoadingIndicator;
