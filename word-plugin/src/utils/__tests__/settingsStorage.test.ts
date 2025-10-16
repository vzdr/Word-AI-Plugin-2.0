/**
 * Comprehensive tests for settingsStorage.ts
 *
 * Tests settings storage utility with comprehensive scenarios:
 * - Load/save settings
 * - Default settings
 * - Settings validation
 * - Normalization logic
 * - Error handling
 * - Migration logic
 */

import {
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings,
  clearSettings,
  hasStoredSettings,
  getSettingsMetadata,
  validateSettings,
  validateCompleteSettings,
  normalizeSettings,
  SettingsStorageError,
  SettingsValidationError,
} from '../settingsStorage';
import {
  AISettings,
  DEFAULT_SETTINGS,
  SETTINGS_CONSTRAINTS,
} from '../../types/settings';

// Mock localStorage
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};

  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
    // Internal store access for testing
    _store: store,
    _reset: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createMockLocalStorage();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('settingsStorage', () => {
  beforeEach(() => {
    mockLocalStorage._reset();
    jest.clearAllMocks();
  });

  describe('loadSettings', () => {
    it('should return default settings when none stored', () => {
      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should load stored settings', () => {
      const storedSettings: AISettings = {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 1000,
      };

      mockLocalStorage.setItem(
        'word-ai-plugin:settings',
        JSON.stringify({
          settings: storedSettings,
          metadata: { lastModified: Date.now(), version: '1.0.0' },
        })
      );

      const loaded = loadSettings();

      expect(loaded).toEqual(storedSettings);
    });

    it('should return defaults if localStorage is unavailable', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('localStorage not available')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should return defaults for invalid stored settings', () => {
      mockLocalStorage.setItem(
        'word-ai-plugin:settings',
        JSON.stringify({
          settings: {
            model: 'invalid-model',
            temperature: 999,
            maxTokens: -100,
          },
          metadata: { lastModified: Date.now(), version: '1.0.0' },
        })
      );

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid stored settings, using defaults:',
        expect.any(Object)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should normalize loaded settings', () => {
      mockLocalStorage.setItem(
        'word-ai-plugin:settings',
        JSON.stringify({
          settings: {
            model: 'gpt-3.5-turbo',
            temperature: 0.751, // Should be rounded to 0.8
            maxTokens: 1000,
          },
          metadata: { lastModified: Date.now(), version: '1.0.0' },
        })
      );

      const settings = loadSettings();

      expect(settings.temperature).toBe(0.8);
    });

    it('should handle malformed JSON', () => {
      mockLocalStorage.setItem('word-ai-plugin:settings', 'invalid json');

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const settings = loadSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('saveSettings', () => {
    it('should save valid settings', () => {
      const settings: AISettings = {
        model: 'gpt-4',
        temperature: 0.8,
        maxTokens: 1500,
      };

      const result = saveSettings(settings);

      expect(result).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalled();

      const stored = JSON.parse(mockLocalStorage._store['word-ai-plugin:settings']);
      expect(stored.settings).toEqual(settings);
      expect(stored.metadata).toBeDefined();
      expect(stored.metadata.version).toBe('1.0.0');
    });

    it('should throw error for invalid settings', () => {
      const invalidSettings = {
        model: 'invalid-model',
        temperature: 0.7,
        maxTokens: 2000,
      } as any;

      expect(() => saveSettings(invalidSettings)).toThrow(SettingsValidationError);
    });

    it('should normalize settings before saving', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.751, // Should be rounded to 0.8
        maxTokens: 1000,
      };

      saveSettings(settings);

      const stored = JSON.parse(mockLocalStorage._store['word-ai-plugin:settings']);
      expect(stored.settings.temperature).toBe(0.8);
    });

    it('should include metadata when saving', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const beforeSave = Date.now();
      saveSettings(settings);
      const afterSave = Date.now();

      const stored = JSON.parse(mockLocalStorage._store['word-ai-plugin:settings']);
      expect(stored.metadata.lastModified).toBeGreaterThanOrEqual(beforeSave);
      expect(stored.metadata.lastModified).toBeLessThanOrEqual(afterSave);
      expect(stored.metadata.version).toBe('1.0.0');
    });

    it('should throw error if localStorage is unavailable', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
      };

      expect(() => saveSettings(settings)).toThrow(SettingsStorageError);
    });
  });

  describe('updateSettings', () => {
    it('should update partial settings', () => {
      saveSettings(DEFAULT_SETTINGS);

      const updated = updateSettings({ temperature: 0.9 });

      expect(updated.model).toBe(DEFAULT_SETTINGS.model);
      expect(updated.temperature).toBe(0.9);
      expect(updated.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
    });

    it('should throw error for invalid partial update', () => {
      saveSettings(DEFAULT_SETTINGS);

      expect(() => updateSettings({ temperature: 999 })).toThrow(
        SettingsValidationError
      );
    });

    it('should save updated settings', () => {
      saveSettings(DEFAULT_SETTINGS);

      updateSettings({ maxTokens: 3000 });

      const loaded = loadSettings();
      expect(loaded.maxTokens).toBe(3000);
    });

    it('should preserve other settings during update', () => {
      const initial: AISettings = {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 1500,
      };

      saveSettings(initial);
      const updated = updateSettings({ temperature: 0.8 });

      expect(updated.model).toBe('gpt-4');
      expect(updated.temperature).toBe(0.8);
      expect(updated.maxTokens).toBe(1500);
    });
  });

  describe('resetSettings', () => {
    it('should reset to default settings', () => {
      const customSettings: AISettings = {
        model: 'gpt-4',
        temperature: 0.9,
        maxTokens: 3000,
      };

      saveSettings(customSettings);
      const reset = resetSettings();

      expect(reset).toEqual(DEFAULT_SETTINGS);

      const loaded = loadSettings();
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('clearSettings', () => {
    it('should clear settings from storage', () => {
      saveSettings(DEFAULT_SETTINGS);

      const result = clearSettings();

      expect(result).toBe(true);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        'word-ai-plugin:settings'
      );
    });

    it('should return false if localStorage is unavailable', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = clearSettings();

      expect(result).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('hasStoredSettings', () => {
    it('should return true when settings exist', () => {
      saveSettings(DEFAULT_SETTINGS);

      expect(hasStoredSettings()).toBe(true);
    });

    it('should return false when no settings stored', () => {
      expect(hasStoredSettings()).toBe(false);
    });

    it('should return false if localStorage is unavailable', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      expect(hasStoredSettings()).toBe(false);
    });
  });

  describe('getSettingsMetadata', () => {
    it('should return metadata for stored settings', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
      };

      saveSettings(settings);
      const metadata = getSettingsMetadata();

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe('1.0.0');
      expect(metadata?.lastModified).toBeDefined();
    });

    it('should return null when no settings stored', () => {
      const metadata = getSettingsMetadata();

      expect(metadata).toBeNull();
    });

    it('should return null if localStorage is unavailable', () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const metadata = getSettingsMetadata();

      expect(metadata).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('validateSettings', () => {
    it('should validate correct settings', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('should detect invalid model', () => {
      const settings = {
        model: 'invalid-model',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.model).toBeDefined();
    });

    it('should detect invalid temperature (too low)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: -0.1,
        maxTokens: 2000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.temperature).toContain('at least');
    });

    it('should detect invalid temperature (too high)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: 1.1,
        maxTokens: 2000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.temperature).toContain('at most');
    });

    it('should detect invalid temperature (wrong step)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.75,
        maxTokens: 2000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.temperature).toContain('multiple of');
    });

    it('should detect invalid maxTokens (too low)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 50,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.maxTokens).toContain('at least');
    });

    it('should detect invalid maxTokens (too high)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 5000,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.maxTokens).toContain('at most');
    });

    it('should detect invalid maxTokens (not integer)', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000.5,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.maxTokens).toContain('integer');
    });

    it('should validate partial settings', () => {
      const partial = { temperature: 0.8 };

      const result = validateSettings(partial);

      expect(result.valid).toBe(true);
    });

    it('should detect multiple errors', () => {
      const settings = {
        model: 'invalid',
        temperature: 999,
        maxTokens: -100,
      };

      const result = validateSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.model).toBeDefined();
      expect(result.errors.temperature).toBeDefined();
      expect(result.errors.maxTokens).toBeDefined();
    });

    it('should stop at first error when validateAll is false', () => {
      const settings = {
        model: 'invalid',
        temperature: 999,
        maxTokens: -100,
      };

      const result = validateSettings(settings, { validateAll: false });

      expect(result.valid).toBe(false);
      expect(Object.keys(result.errors).length).toBe(1);
    });
  });

  describe('validateCompleteSettings', () => {
    it('should require all fields', () => {
      const partial = { temperature: 0.7 } as any;

      const result = validateCompleteSettings(partial);

      expect(result.valid).toBe(false);
      expect(result.errors.model).toBeDefined();
      expect(result.errors.maxTokens).toBeDefined();
    });

    it('should validate complete settings', () => {
      const complete: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const result = validateCompleteSettings(complete);

      expect(result.valid).toBe(true);
    });

    it('should check for null values', () => {
      const settings = {
        model: 'gpt-3.5-turbo',
        temperature: null,
        maxTokens: 2000,
      } as any;

      const result = validateCompleteSettings(settings);

      expect(result.valid).toBe(false);
      expect(result.errors.temperature).toBeDefined();
    });
  });

  describe('normalizeSettings', () => {
    it('should normalize temperature to nearest step', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.751,
        maxTokens: 2000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.temperature).toBe(0.8);
    });

    it('should clamp temperature to min', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: -0.5,
        maxTokens: 2000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.temperature).toBe(0.0);
    });

    it('should clamp temperature to max', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 1.5,
        maxTokens: 2000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.temperature).toBe(1.0);
    });

    it('should clamp maxTokens to min', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 50,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.maxTokens).toBe(100);
    });

    it('should clamp maxTokens to max', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 10000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.maxTokens).toBe(4000);
    });

    it('should round maxTokens to integer', () => {
      const settings: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000.7,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.maxTokens).toBe(2001);
    });

    it('should use default model for invalid model', () => {
      const settings = {
        model: 'invalid-model' as any,
        temperature: 0.7,
        maxTokens: 2000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.model).toBe(DEFAULT_SETTINGS.model);
    });

    it('should preserve valid model', () => {
      const settings: AISettings = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const normalized = normalizeSettings(settings);

      expect(normalized.model).toBe('gpt-4');
    });
  });

  describe('error classes', () => {
    it('should create SettingsStorageError', () => {
      const error = new SettingsStorageError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('SettingsStorageError');
      expect(error.message).toBe('Test error');
    });

    it('should create SettingsStorageError with original error', () => {
      const originalError = new Error('Original');
      const error = new SettingsStorageError('Test error', originalError);

      expect(error.originalError).toBe(originalError);
    });

    it('should create SettingsValidationError', () => {
      const validationErrors = { model: 'Invalid model' };
      const error = new SettingsValidationError('Validation failed', validationErrors);

      expect(error).toBeInstanceOf(SettingsStorageError);
      expect(error.name).toBe('SettingsValidationError');
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });

  describe('edge cases', () => {
    it('should handle temperature at exact boundaries', () => {
      const settings1: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.0,
        maxTokens: 2000,
      };

      const settings2: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 1.0,
        maxTokens: 2000,
      };

      expect(validateSettings(settings1).valid).toBe(true);
      expect(validateSettings(settings2).valid).toBe(true);
    });

    it('should handle maxTokens at exact boundaries', () => {
      const settings1: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 100,
      };

      const settings2: AISettings = {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 4000,
      };

      expect(validateSettings(settings1).valid).toBe(true);
      expect(validateSettings(settings2).valid).toBe(true);
    });

    it('should handle all valid models', () => {
      const models: Array<'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo'> = [
        'gpt-3.5-turbo',
        'gpt-4',
        'gpt-4-turbo',
      ];

      models.forEach((model) => {
        const settings: AISettings = {
          model,
          temperature: 0.7,
          maxTokens: 2000,
        };

        expect(validateSettings(settings).valid).toBe(true);
      });
    });
  });
});
