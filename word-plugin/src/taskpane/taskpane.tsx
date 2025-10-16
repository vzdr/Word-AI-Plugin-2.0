import * as React from 'react';
import * as ReactDOM from 'react-dom';
import App from './App';
import ErrorBoundary from '../components/ErrorBoundary';
import { NetworkStatusProvider } from '../contexts/NetworkStatusContext';
import { logger } from '../utils/logger';
import { reportError } from '../utils/errorReporting';

// Handle errors caught by ErrorBoundary
const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
  logger.error('React component error caught by ErrorBoundary', error, {
    componentStack: errorInfo.componentStack
  });
  reportError(error, {
    componentStack: errorInfo.componentStack,
    source: 'ErrorBoundary'
  });
};

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    logger.info('Office.js ready', { host: info.host, platform: info.platform });

    ReactDOM.render(
      <ErrorBoundary onError={handleError}>
        <NetworkStatusProvider>
          <App />
        </NetworkStatusProvider>
      </ErrorBoundary>,
      document.getElementById('root')
    );
  } else {
    logger.warn('Not running in Word', { host: info.host });
  }
});
