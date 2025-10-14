import * as React from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import styles from './OfflineIndicator.module.css';

/**
 * Props for the OfflineIndicator component
 */
export interface OfflineIndicatorProps {
  /** Optional custom message to display when offline */
  message?: string;
  /** Optional: Position of the indicator (default: 'top') */
  position?: 'top' | 'bottom';
}

/**
 * OfflineIndicator component displays a warning banner when the application is offline.
 * The banner is dismissible but will reappear if the application is still offline after a brief delay.
 *
 * Features:
 * - Automatically shows/hides based on network status
 * - Dismissible by user (temporarily)
 * - Reappears if still offline after dismissal
 * - Accessible with ARIA role="alert"
 * - Smooth animations
 *
 * @example
 * ```tsx
 * <OfflineIndicator />
 * ```
 *
 * @example With custom message
 * ```tsx
 * <OfflineIndicator message="Connection lost. Some features may be unavailable." />
 * ```
 */
const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  message = 'You are currently offline. Some features may be unavailable.',
  position = 'top'
}) => {
  const { isOnline } = useNetworkStatus();
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(false);

  // Track previous online status to detect transitions
  const prevIsOnlineRef = React.useRef(isOnline);

  React.useEffect(() => {
    // If we just went offline
    if (!isOnline && prevIsOnlineRef.current) {
      setIsDismissed(false); // Reset dismissed state when going offline
      setIsVisible(true);
    }

    // If we just came back online
    if (isOnline && !prevIsOnlineRef.current) {
      setIsVisible(false);
      setIsDismissed(false);
    }

    // Update previous status
    prevIsOnlineRef.current = isOnline;
  }, [isOnline]);

  React.useEffect(() => {
    // If dismissed while offline, reappear after 5 seconds
    if (isDismissed && !isOnline) {
      const timeoutId = setTimeout(() => {
        setIsDismissed(false);
        setIsVisible(true);
      }, 5000);

      return () => clearTimeout(timeoutId);
    }
  }, [isDismissed, isOnline]);

  /**
   * Handle dismiss button click
   */
  const handleDismiss = (): void => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  // Don't render if online or if dismissed (and waiting to reappear)
  if (isOnline || (isDismissed && !isVisible)) {
    return null;
  }

  return (
    <div
      className={`${styles.container} ${styles[`container-${position}`]} ${
        isVisible ? styles.visible : ''
      }`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className={styles.content}>
        <span className={styles.icon} aria-hidden="true">
          📡
        </span>
        <div className={styles.messageContainer}>
          <p className={styles.message}>{message}</p>
        </div>
      </div>
      <button
        type="button"
        className={styles.dismissButton}
        onClick={handleDismiss}
        aria-label="Dismiss offline notification"
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

export default OfflineIndicator;
