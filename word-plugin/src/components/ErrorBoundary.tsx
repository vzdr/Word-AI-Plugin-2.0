import * as React from 'react';
import styles from './ErrorBoundary.module.css';

/**
 * Props for the ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** Child components to be wrapped by the error boundary */
  children: React.ReactNode;
  /** Optional callback function to be called when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Optional custom fallback UI component */
  fallback?: React.ReactNode;
}

/**
 * State for the ErrorBoundary component
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary component catches unhandled JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 *
 * This is a class component because React error boundaries must be implemented as class components
 * (there is no hook equivalent as of React 18).
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  /**
   * Update state so the next render will show the fallback UI.
   * This lifecycle method is invoked after an error has been thrown by a descendant component.
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  /**
   * Log error details to console and call optional onError callback.
   * This lifecycle method is invoked after an error has been thrown by a descendant component.
   * It receives two parameters: error and errorInfo.
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Update state with error info
    this.setState({ errorInfo });

    // Call optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  /**
   * Reset the error boundary state to allow the application to attempt recovery
   */
  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  /**
   * Reload the entire application
   */
  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div
          className={styles.container}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div className={styles.content}>
            <div className={styles.iconContainer}>
              <span className={styles.icon} aria-hidden="true">
                ⚠️
              </span>
            </div>
            <div className={styles.messageContainer}>
              <h2 className={styles.title}>Something went wrong</h2>
              <p className={styles.message}>
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className={styles.details}>
                  <summary className={styles.detailsSummary}>Error details</summary>
                  <pre className={styles.stackTrace}>
                    {this.state.error?.stack}
                    {'\n\n'}
                    Component Stack:
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={this.handleReload}
              aria-label="Reload the application"
            >
              Reload
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={this.handleReset}
              aria-label="Try again without reloading"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
