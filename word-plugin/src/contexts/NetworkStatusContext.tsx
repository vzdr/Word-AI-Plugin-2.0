import * as React from 'react';

/**
 * Network status context value interface
 */
export interface NetworkStatusContextValue {
  /** Whether the application is currently online */
  isOnline: boolean;
}

/**
 * Props for NetworkStatusProvider component
 */
export interface NetworkStatusProviderProps {
  /** Child components that will have access to network status */
  children: React.ReactNode;
  /** Optional: Enable periodic connectivity probing (default: false) */
  enableProbing?: boolean;
  /** Optional: Probe interval in milliseconds (default: 30000 - 30 seconds) */
  probeInterval?: number;
  /** Optional: Probe URL to check connectivity (default: '/') */
  probeUrl?: string;
}

/**
 * Context for managing and providing network status throughout the application.
 * Consumers can subscribe to online/offline state changes.
 */
const NetworkStatusContext = React.createContext<NetworkStatusContextValue | undefined>(
  undefined
);

/**
 * NetworkStatusProvider component provides network status information to all child components.
 * It listens to browser online/offline events and optionally performs periodic connectivity probes.
 *
 * Uses the Navigator.onLine API which provides basic online/offline detection.
 * The API returns:
 * - false: Definitely offline (no network connection)
 * - true: Possibly online (network connection exists, but internet may not be accessible)
 *
 * Optional periodic probing can verify actual internet connectivity by making HTTP requests.
 *
 * @example
 * ```tsx
 * <NetworkStatusProvider>
 *   <App />
 * </NetworkStatusProvider>
 * ```
 *
 * @example With periodic probing
 * ```tsx
 * <NetworkStatusProvider enableProbing probeInterval={60000}>
 *   <App />
 * </NetworkStatusProvider>
 * ```
 */
export const NetworkStatusProvider: React.FC<NetworkStatusProviderProps> = ({
  children,
  enableProbing = false,
  probeInterval = 30000,
  probeUrl = '/'
}) => {
  // Initialize with navigator.onLine value
  const [isOnline, setIsOnline] = React.useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  React.useEffect(() => {
    /**
     * Handle online event - fired when browser gains network connection
     */
    const handleOnline = (): void => {
      console.log('Network status: Online');
      setIsOnline(true);
    };

    /**
     * Handle offline event - fired when browser loses network connection
     */
    const handleOffline = (): void => {
      console.log('Network status: Offline');
      setIsOnline(false);
    };

    // Add event listeners for online/offline events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup event listeners on unmount
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  React.useEffect(() => {
    // Only set up probing if enabled
    if (!enableProbing) {
      return;
    }

    /**
     * Probe network connectivity by making an HTTP request.
     * This provides more reliable connectivity detection than navigator.onLine alone.
     */
    const probeConnectivity = async (): Promise<void> => {
      try {
        // Attempt to fetch with a cache-busting parameter to ensure fresh request
        const response = await fetch(probeUrl, {
          method: 'HEAD',
          cache: 'no-cache',
          // Add timestamp to prevent caching
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        // Consider online if request succeeds
        if (response.ok || response.type === 'opaque') {
          if (!isOnline) {
            console.log('Network probe: Connection restored');
            setIsOnline(true);
          }
        } else {
          // Request failed - likely offline
          if (isOnline) {
            console.log('Network probe: Connection lost');
            setIsOnline(false);
          }
        }
      } catch (error) {
        // Fetch failed - definitely offline
        if (isOnline) {
          console.log('Network probe: Connection error', error);
          setIsOnline(false);
        }
      }
    };

    // Initial probe
    probeConnectivity();

    // Set up periodic probing
    const intervalId = setInterval(probeConnectivity, probeInterval);

    // Cleanup interval on unmount or when probing is disabled
    return () => {
      clearInterval(intervalId);
    };
  }, [enableProbing, probeInterval, probeUrl, isOnline]);

  const value: NetworkStatusContextValue = {
    isOnline
  };

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
};

/**
 * Hook to access network status context.
 * Must be used within a NetworkStatusProvider.
 *
 * @throws Error if used outside of NetworkStatusProvider
 *
 * @returns NetworkStatusContextValue containing isOnline boolean
 *
 * @example
 * ```tsx
 * const { isOnline } = useNetworkStatus();
 *
 * if (!isOnline) {
 *   return <OfflineWarning />;
 * }
 * ```
 */
export const useNetworkStatus = (): NetworkStatusContextValue => {
  const context = React.useContext(NetworkStatusContext);

  if (context === undefined) {
    throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
  }

  return context;
};

export default NetworkStatusContext;
