/**
 * Comprehensive tests for storage utilities
 *
 * Tests session storage functions with error handling,
 * type safety, expiration, and specialized storage functions.
 */

import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  clearPluginStorage,
  getStorageInfo,
  saveInlineContext,
  getInlineContext,
  saveUploadedFiles,
  getUploadedFiles,
  StorageError,
  StorageQuotaError,
  StorageAccessError,
} from '../storage';

// Mock sessionStorage
const createMockStorage = () => {
  let store: Record<string, string> = {};

  const getItemImpl = (key: string) => store[key] || null;
  const setItemImpl = (key: string, value: string) => {
    if (value.length > 1000000) {
      throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    }
    store[key] = value;
  };
  const removeItemImpl = (key: string) => {
    delete store[key];
  };
  const clearImpl = () => {
    store = {};
  };
  const keyImpl = (index: number) => {
    const keys = Object.keys(store);
    return keys[index] || null;
  };

  return {
    getItem: jest.fn(getItemImpl),
    setItem: jest.fn(setItemImpl),
    removeItem: jest.fn(removeItemImpl),
    clear: jest.fn(clearImpl),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn(keyImpl),
    // Store reference for internal access
    _store: store,
    _resetImplementations() {
      this.getItem.mockImplementation(getItemImpl);
      this.setItem.mockImplementation(setItemImpl);
      this.removeItem.mockImplementation(removeItemImpl);
      this.key.mockImplementation(keyImpl);
    }
  };
};

const mockSessionStorage = createMockStorage();

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

describe('Storage Utilities', () => {
  beforeEach(() => {
    mockSessionStorage.clear();
    mockSessionStorage._resetImplementations();
    jest.clearAllMocks();
  });

  describe('getStorageItem', () => {
    it('should retrieve stored item', () => {
      const testData = { value: 'test' };
      setStorageItem('test-key', testData);

      const result = getStorageItem<{ value: string }>('test-key');
      expect(result).toEqual(testData);
    });

    it('should return null for non-existent key', () => {
      const result = getStorageItem('non-existent');
      expect(result).toBeNull();
    });

    it('should handle expiration', () => {
      setStorageItem('expired-key', 'data');

      // Try to get with expiration that has passed
      const result = getStorageItem('expired-key', { expirationMs: -1 });
      expect(result).toBeNull();
    });

    it('should return data within expiration period', () => {
      setStorageItem('fresh-key', 'data');

      const result = getStorageItem('fresh-key', { expirationMs: 10000 });
      expect(result).toBe('data');
    });

    it('should call onError callback on error', () => {
      const onError = jest.fn();
      mockSessionStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = getStorageItem('key', { onError });

      expect(result).toBeNull();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(StorageError);
    });

    it('should handle invalid JSON', () => {
      mockSessionStorage.getItem.mockReturnValue('invalid json');

      const result = getStorageItem('key');
      expect(result).toBeNull();
    });
  });

  describe('setStorageItem', () => {
    it('should store item successfully', () => {
      const data = { test: 'value', nested: { prop: 123 } };
      const result = setStorageItem('test-key', data);

      expect(result).toBe(true);
      expect(mockSessionStorage.setItem).toHaveBeenCalled();
    });

    it('should handle storage quota exceeded', () => {
      const largeData = 'x'.repeat(2000000);
      const result = setStorageItem('large-key', largeData);

      expect(result).toBe(false);
    });

    it('should call onError callback on quota error', () => {
      const onError = jest.fn();
      const largeData = 'x'.repeat(2000000);

      setStorageItem('large-key', largeData, { onError });

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(StorageQuotaError);
    });

    it('should store different data types', () => {
      expect(setStorageItem('string', 'test')).toBe(true);
      expect(setStorageItem('number', 123)).toBe(true);
      expect(setStorageItem('boolean', true)).toBe(true);
      expect(setStorageItem('object', { key: 'value' })).toBe(true);
      expect(setStorageItem('array', [1, 2, 3])).toBe(true);
      expect(setStorageItem('null', null)).toBe(true);
    });
  });

  describe('removeStorageItem', () => {
    it('should remove stored item', () => {
      setStorageItem('test-key', 'data');
      const result = removeStorageItem('test-key');

      expect(result).toBe(true);
      expect(getStorageItem('test-key')).toBeNull();
    });

    it('should handle removing non-existent key', () => {
      const result = removeStorageItem('non-existent');
      expect(result).toBe(true);
    });

    it('should call onError callback on error', () => {
      const onError = jest.fn();
      mockSessionStorage.removeItem.mockImplementation(() => {
        throw new Error('Remove error');
      });

      const result = removeStorageItem('key', { onError });

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('clearPluginStorage', () => {
    it('should clear all plugin-related items', () => {
      setStorageItem('item1', 'data1');
      setStorageItem('item2', 'data2');
      setStorageItem('item3', 'data3');

      const result = clearPluginStorage();

      expect(result).toBe(true);
      expect(getStorageItem('item1')).toBeNull();
      expect(getStorageItem('item2')).toBeNull();
      expect(getStorageItem('item3')).toBeNull();
    });

    it('should not clear non-plugin items', () => {
      // Set a non-plugin item directly
      sessionStorage.setItem('other-app:key', 'data');
      setStorageItem('plugin-key', 'data');

      clearPluginStorage();

      expect(sessionStorage.getItem('other-app:key')).toBe('data');
      expect(getStorageItem('plugin-key')).toBeNull();
    });

    it('should call onError callback on error', () => {
      const onError = jest.fn();
      // Add some items so the loop will execute
      setStorageItem('item1', 'data1');

      // Make key() throw an error
      mockSessionStorage.key.mockImplementation(() => {
        throw new Error('Clear error');
      });

      const result = clearPluginStorage({ onError });

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('getStorageInfo', () => {
    it('should return storage information', () => {
      setStorageItem('item1', 'data1');
      setStorageItem('item2', 'data2');

      const info = getStorageInfo();

      expect(info.available).toBe(true);
      expect(info.itemCount).toBeGreaterThan(0);
      expect(info.used).toBeGreaterThan(0);
    });

    it('should return zero for empty storage', () => {
      clearPluginStorage();

      const info = getStorageInfo();

      expect(info.available).toBe(true);
      expect(info.itemCount).toBe(0);
      expect(info.used).toBe(0);
    });
  });

  describe('saveInlineContext', () => {
    it('should save inline context', () => {
      const text = 'This is inline context';
      const result = saveInlineContext(text);

      expect(result).toBe(true);

      const saved = getInlineContext();
      expect(saved).toBeDefined();
      expect(saved?.text).toBe(text);
      expect(saved?.characterCount).toBe(text.length);
      expect(saved?.lastModified).toBeLessThanOrEqual(Date.now());
    });

    it('should update existing inline context', () => {
      saveInlineContext('First text');
      const firstSaved = getInlineContext();

      saveInlineContext('Second text');
      const secondSaved = getInlineContext();

      expect(secondSaved?.text).toBe('Second text');
      expect(secondSaved?.lastModified).toBeGreaterThanOrEqual(firstSaved!.lastModified);
    });
  });

  describe('getInlineContext', () => {
    it('should retrieve inline context', () => {
      const text = 'Test context';
      saveInlineContext(text);

      const context = getInlineContext();

      expect(context).toBeDefined();
      expect(context?.text).toBe(text);
      expect(context?.characterCount).toBe(text.length);
    });

    it('should return null when no context saved', () => {
      const context = getInlineContext();
      expect(context).toBeNull();
    });
  });

  describe('saveUploadedFiles', () => {
    it('should save uploaded files', () => {
      const files = [
        {
          id: '1',
          name: 'file1.pdf',
          content: 'content1',
          size: 1000,
          uploadedAt: Date.now(),
        },
        {
          id: '2',
          name: 'file2.docx',
          content: 'content2',
          size: 2000,
          uploadedAt: Date.now(),
        },
      ];

      const result = saveUploadedFiles(files);

      expect(result).toBe(true);

      const saved = getUploadedFiles();
      expect(saved).toHaveLength(2);
      expect(saved![0].id).toBe('1');
      expect(saved![1].id).toBe('2');
    });

    it('should overwrite existing files', () => {
      const files1 = [
        { id: '1', name: 'file1.pdf', content: '', size: 1000, uploadedAt: Date.now() },
      ];
      const files2 = [
        { id: '2', name: 'file2.pdf', content: '', size: 2000, uploadedAt: Date.now() },
      ];

      saveUploadedFiles(files1);
      saveUploadedFiles(files2);

      const saved = getUploadedFiles();
      expect(saved).toHaveLength(1);
      expect(saved![0].id).toBe('2');
    });
  });

  describe('getUploadedFiles', () => {
    it('should retrieve uploaded files', () => {
      const files = [
        { id: '1', name: 'file.pdf', content: '', size: 1000, uploadedAt: Date.now() },
      ];

      saveUploadedFiles(files);
      const retrieved = getUploadedFiles();

      expect(retrieved).toEqual(files);
    });

    it('should return null when no files saved', () => {
      const files = getUploadedFiles();
      expect(files).toBeNull();
    });
  });

  describe('Error classes', () => {
    it('should create StorageError with message', () => {
      const error = new StorageError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('StorageError');
      expect(error.message).toBe('Test error');
    });

    it('should create StorageError with original error', () => {
      const originalError = new Error('Original');
      const error = new StorageError('Test error', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should create StorageQuotaError', () => {
      const error = new StorageQuotaError();
      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('StorageQuotaError');
      expect(error.message).toContain('quota');
    });

    it('should create StorageAccessError', () => {
      const error = new StorageAccessError();
      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('StorageAccessError');
      expect(error.message).toContain('access');
    });
  });

  describe('Storage unavailable scenarios', () => {
    it('should handle storage being unavailable', () => {
      // Temporarily make storage throw
      const originalGetItem = mockSessionStorage.getItem;
      mockSessionStorage.getItem = jest.fn(() => {
        throw new Error('Storage unavailable');
      });

      const result = getStorageItem('key');
      expect(result).toBeNull();

      // Restore
      mockSessionStorage.getItem = originalGetItem;
    });

    it('should return appropriate error for unavailable storage', () => {
      const originalSetItem = mockSessionStorage.setItem;
      mockSessionStorage.setItem = jest.fn(() => {
        throw new Error('Storage unavailable');
      });

      const result = setStorageItem('key', 'value');
      expect(result).toBe(false);

      // Restore
      mockSessionStorage.setItem = originalSetItem;
    });
  });
});
