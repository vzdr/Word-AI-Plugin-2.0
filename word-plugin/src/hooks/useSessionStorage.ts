import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  StorageOptions,
  StorageError,
} from '../utils/storage';

/**
 * Hook options
 */
export interface UseSessionStorageOptions<T> extends StorageOptions {
  autoSaveDelay?: number; // Delay in ms before auto-saving (default: 500ms)
  defaultValue?: T;
  onSaveSuccess?: (value: T) => void;
  onSaveError?: (error: StorageError) => void;
  onLoadError?: (error: StorageError) => void;
}

/**
 * Hook return type
 */
export interface UseSessionStorageReturn<T> {
  value: T;
  setValue: (newValue: T | ((prev: T) => T)) => void;
  save: () => boolean;
  remove: () => boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: StorageError | null;
  lastSaved: number | null;
}

/**
 * Custom hook for session storage with auto-save functionality
 *
 * @param key - Storage key (will be prefixed automatically)
 * @param options - Configuration options
 * @returns Storage state and control functions
 *
 * @example
 * ```tsx
 * const { value, setValue, isLoading, error } = useSessionStorage<string>(
 *   'inline-context',
 *   { defaultValue: '', autoSaveDelay: 500 }
 * );
 * ```
 */
export function useSessionStorage<T>(
  key: string,
  options: UseSessionStorageOptions<T> = {}
): UseSessionStorageReturn<T> {
  const {
    autoSaveDelay = 500,
    defaultValue,
    onSaveSuccess,
    onSaveError,
    onLoadError,
    ...storageOptions
  } = options;

  // State
  const [value, setValueState] = useState<T>(
    defaultValue as T
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<StorageError | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  // Refs for auto-save timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  /**
   * Load initial value from storage
   */
  useEffect(() => {
    mountedRef.current = true;

    const loadInitialValue = () => {
      try {
        const storedValue = getStorageItem<T>(key, {
          ...storageOptions,
          onError: (err) => {
            setError(err as StorageError);
            if (onLoadError) {
              onLoadError(err as StorageError);
            }
          },
        });

        if (storedValue !== null) {
          setValueState(storedValue);
        } else if (defaultValue !== undefined) {
          setValueState(defaultValue);
        }
      } catch (err) {
        const storageError = new StorageError(
          'Failed to load from storage',
          err as Error
        );
        setError(storageError);
        if (onLoadError) {
          onLoadError(storageError);
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadInitialValue();

    return () => {
      mountedRef.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [key]); // Only re-run if key changes

  /**
   * Save value to storage
   */
  const save = useCallback((): boolean => {
    if (!mountedRef.current) return false;

    setIsSaving(true);
    setError(null);

    const success = setStorageItem<T>(key, value, {
      ...storageOptions,
      onError: (err) => {
        setError(err as StorageError);
        if (onSaveError) {
          onSaveError(err as StorageError);
        }
      },
    });

    if (mountedRef.current) {
      setIsSaving(false);

      if (success) {
        setLastSaved(Date.now());
        if (onSaveSuccess) {
          onSaveSuccess(value);
        }
      }
    }

    return success;
  }, [key, value, storageOptions, onSaveSuccess, onSaveError]);

  /**
   * Set value and trigger auto-save
   */
  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const nextValue =
          typeof newValue === 'function'
            ? (newValue as (prev: T) => T)(prev)
            : newValue;

        // Clear existing timer
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }

        // Set new auto-save timer
        if (autoSaveDelay > 0) {
          autoSaveTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setStorageItem<T>(key, nextValue, {
                ...storageOptions,
                onError: (err) => {
                  setError(err as StorageError);
                  if (onSaveError) {
                    onSaveError(err as StorageError);
                  }
                },
              });
              setLastSaved(Date.now());
              if (onSaveSuccess) {
                onSaveSuccess(nextValue);
              }
            }
          }, autoSaveDelay);
        }

        return nextValue;
      });
    },
    [key, autoSaveDelay, storageOptions, onSaveSuccess, onSaveError]
  );

  /**
   * Remove value from storage
   */
  const remove = useCallback((): boolean => {
    if (!mountedRef.current) return false;

    // Clear auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const success = removeStorageItem(key, {
      ...storageOptions,
      onError: (err) => {
        setError(err as StorageError);
      },
    });

    if (success && mountedRef.current) {
      if (defaultValue !== undefined) {
        setValueState(defaultValue);
      }
      setLastSaved(null);
    }

    return success;
  }, [key, defaultValue, storageOptions]);

  return {
    value,
    setValue,
    save,
    remove,
    isLoading,
    isSaving,
    error,
    lastSaved,
  };
}

/**
 * Specialized hook for inline context storage
 */
export function useInlineContext(initialValue = '') {
  return useSessionStorage<string>('inline-context', {
    defaultValue: initialValue,
    autoSaveDelay: 500,
  });
}

/**
 * Specialized hook for uploaded files storage
 */
export interface UploadedFile {
  id: string;
  name: string;
  content: string;
  size: number;
  uploadedAt: number;
}

export function useUploadedFiles(initialValue: UploadedFile[] = []) {
  return useSessionStorage<UploadedFile[]>('uploaded-files', {
    defaultValue: initialValue,
    autoSaveDelay: 1000,
  });
}
