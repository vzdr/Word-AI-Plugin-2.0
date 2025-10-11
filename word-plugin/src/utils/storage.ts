/**
 * Storage utility for Word AI Plugin
 * Provides session storage with error handling and type safety
 */

// Storage key prefix to avoid conflicts
const STORAGE_PREFIX = 'word-ai-plugin';

// TypeScript interfaces for storage
export interface StorageValue {
  data: unknown;
  timestamp: number;
}

export interface StorageOptions {
  expirationMs?: number;
  onError?: (error: Error) => void;
}

export interface InlineContextData {
  text: string;
  characterCount: number;
  lastModified: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  content: string;
  size: number;
  uploadedAt: number;
}

export interface SessionData {
  inlineContext?: InlineContextData;
  uploadedFiles?: UploadedFile[];
  selectedText?: string;
}

// Storage errors
export class StorageError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageQuotaError extends StorageError {
  constructor(originalError?: Error) {
    super('Storage quota exceeded', originalError);
    this.name = 'StorageQuotaError';
  }
}

export class StorageAccessError extends StorageError {
  constructor(originalError?: Error) {
    super('Storage access denied', originalError);
    this.name = 'StorageAccessError';
  }
}

/**
 * Generate storage key with prefix
 */
function getStorageKey(key: string): string {
  return `${STORAGE_PREFIX}:${key}`;
}

/**
 * Check if storage is available
 */
function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    sessionStorage.setItem(testKey, 'test');
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get item from session storage with type safety
 */
export function getStorageItem<T>(
  key: string,
  options?: StorageOptions
): T | null {
  try {
    if (!isStorageAvailable()) {
      throw new StorageAccessError();
    }

    const storageKey = getStorageKey(key);
    const item = sessionStorage.getItem(storageKey);

    if (!item) {
      return null;
    }

    const parsed: StorageValue = JSON.parse(item);

    // Check expiration
    if (options?.expirationMs) {
      const now = Date.now();
      const age = now - parsed.timestamp;
      if (age > options.expirationMs) {
        // Remove expired item
        sessionStorage.removeItem(storageKey);
        return null;
      }
    }

    return parsed.data as T;
  } catch (error) {
    const storageError =
      error instanceof StorageError
        ? error
        : new StorageError('Failed to get storage item', error as Error);

    if (options?.onError) {
      options.onError(storageError);
    } else {
      console.error('Storage get error:', storageError);
    }
    return null;
  }
}

/**
 * Set item in session storage with type safety
 */
export function setStorageItem<T>(
  key: string,
  value: T,
  options?: StorageOptions
): boolean {
  try {
    if (!isStorageAvailable()) {
      throw new StorageAccessError();
    }

    const storageKey = getStorageKey(key);
    const storageValue: StorageValue = {
      data: value,
      timestamp: Date.now(),
    };

    sessionStorage.setItem(storageKey, JSON.stringify(storageValue));
    return true;
  } catch (error) {
    let storageError: StorageError;

    if (error instanceof StorageError) {
      storageError = error;
    } else if (
      error instanceof Error &&
      (error.name === 'QuotaExceededError' ||
        error.message.includes('quota'))
    ) {
      storageError = new StorageQuotaError(error);
    } else {
      storageError = new StorageError(
        'Failed to set storage item',
        error as Error
      );
    }

    if (options?.onError) {
      options.onError(storageError);
    } else {
      console.error('Storage set error:', storageError);
    }
    return false;
  }
}

/**
 * Remove item from session storage
 */
export function removeStorageItem(
  key: string,
  options?: StorageOptions
): boolean {
  try {
    if (!isStorageAvailable()) {
      throw new StorageAccessError();
    }

    const storageKey = getStorageKey(key);
    sessionStorage.removeItem(storageKey);
    return true;
  } catch (error) {
    const storageError =
      error instanceof StorageError
        ? error
        : new StorageError('Failed to remove storage item', error as Error);

    if (options?.onError) {
      options.onError(storageError);
    } else {
      console.error('Storage remove error:', storageError);
    }
    return false;
  }
}

/**
 * Clear all plugin-related items from storage
 */
export function clearPluginStorage(options?: StorageOptions): boolean {
  try {
    if (!isStorageAvailable()) {
      throw new StorageAccessError();
    }

    const keysToRemove: string[] = [];

    // Find all keys with our prefix
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    // Remove all found keys
    keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    return true;
  } catch (error) {
    const storageError =
      error instanceof StorageError
        ? error
        : new StorageError('Failed to clear storage', error as Error);

    if (options?.onError) {
      options.onError(storageError);
    } else {
      console.error('Storage clear error:', storageError);
    }
    return false;
  }
}

/**
 * Get storage usage information
 */
export function getStorageInfo(): {
  used: number;
  available: boolean;
  itemCount: number;
} {
  if (!isStorageAvailable()) {
    return { used: 0, available: false, itemCount: 0 };
  }

  let used = 0;
  let itemCount = 0;

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      const item = sessionStorage.getItem(key);
      if (item) {
        used += item.length + key.length;
        itemCount++;
      }
    }
  }

  return { used, available: true, itemCount };
}

/**
 * Specialized function for inline context storage
 */
export function saveInlineContext(text: string): boolean {
  const contextData: InlineContextData = {
    text,
    characterCount: text.length,
    lastModified: Date.now(),
  };

  return setStorageItem<InlineContextData>('inline-context', contextData);
}

/**
 * Specialized function for inline context retrieval
 */
export function getInlineContext(): InlineContextData | null {
  return getStorageItem<InlineContextData>('inline-context');
}

/**
 * Specialized function for uploaded files storage
 */
export function saveUploadedFiles(files: UploadedFile[]): boolean {
  return setStorageItem<UploadedFile[]>('uploaded-files', files);
}

/**
 * Specialized function for uploaded files retrieval
 */
export function getUploadedFiles(): UploadedFile[] | null {
  return getStorageItem<UploadedFile[]>('uploaded-files');
}
