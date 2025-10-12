/**
 * Settings storage utility for Word AI Plugin
 * Provides localStorage-based settings persistence with validation
 */

import {
  AISettings,
  AIModel,
  DEFAULT_SETTINGS,
  SETTINGS_CONSTRAINTS,
  SettingsConstraints,
  SettingsValidationResult,
  SettingsValidationErrors,
  SettingsValidationOptions,
  PartialSettings,
  StoredSettings,
  SettingsMetadata,
} from '../types/settings';

// Storage key for settings
const SETTINGS_STORAGE_KEY = 'word-ai-plugin:settings';
const SETTINGS_VERSION = '1.0.0';

/**
 * Settings storage errors
 */
export class SettingsStorageError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'SettingsStorageError';
  }
}

export class SettingsValidationError extends SettingsStorageError {
  constructor(
    message: string,
    public readonly validationErrors: SettingsValidationErrors
  ) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate temperature value
 */
function validateTemperature(
  temperature: number,
  constraints: SettingsConstraints = SETTINGS_CONSTRAINTS
): string | undefined {
  if (typeof temperature !== 'number' || isNaN(temperature)) {
    return 'Temperature must be a valid number';
  }

  if (temperature < constraints.temperature.min) {
    return `Temperature must be at least ${constraints.temperature.min}`;
  }

  if (temperature > constraints.temperature.max) {
    return `Temperature must be at most ${constraints.temperature.max}`;
  }

  // Round to nearest step
  const rounded =
    Math.round(temperature / constraints.temperature.step) *
    constraints.temperature.step;
  if (Math.abs(rounded - temperature) > 0.001) {
    return `Temperature must be a multiple of ${constraints.temperature.step}`;
  }

  return undefined;
}

/**
 * Validate maxTokens value
 */
function validateMaxTokens(
  maxTokens: number,
  constraints: SettingsConstraints = SETTINGS_CONSTRAINTS
): string | undefined {
  if (typeof maxTokens !== 'number' || isNaN(maxTokens)) {
    return 'Max tokens must be a valid number';
  }

  if (!Number.isInteger(maxTokens)) {
    return 'Max tokens must be an integer';
  }

  if (maxTokens < constraints.maxTokens.min) {
    return `Max tokens must be at least ${constraints.maxTokens.min}`;
  }

  if (maxTokens > constraints.maxTokens.max) {
    return `Max tokens must be at most ${constraints.maxTokens.max}`;
  }

  return undefined;
}

/**
 * Validate model value
 */
function validateModel(
  model: string,
  constraints: SettingsConstraints = SETTINGS_CONSTRAINTS
): string | undefined {
  if (!model || typeof model !== 'string') {
    return 'Model must be specified';
  }

  if (!constraints.allowedModels.includes(model as AIModel)) {
    return `Model must be one of: ${constraints.allowedModels.join(', ')}`;
  }

  return undefined;
}

/**
 * Validate settings object
 */
export function validateSettings(
  settings: Partial<AISettings>,
  options: SettingsValidationOptions = {}
): SettingsValidationResult {
  const { constraints = SETTINGS_CONSTRAINTS, validateAll = true } = options;
  const errors: SettingsValidationErrors = {};
  let hasErrors = false;

  // Validate model
  if (settings.model !== undefined) {
    const modelError = validateModel(settings.model, constraints);
    if (modelError) {
      errors.model = modelError;
      hasErrors = true;
      if (!validateAll) {
        return { valid: false, errors };
      }
    }
  }

  // Validate temperature
  if (settings.temperature !== undefined) {
    const tempError = validateTemperature(settings.temperature, constraints);
    if (tempError) {
      errors.temperature = tempError;
      hasErrors = true;
      if (!validateAll) {
        return { valid: false, errors };
      }
    }
  }

  // Validate maxTokens
  if (settings.maxTokens !== undefined) {
    const tokensError = validateMaxTokens(settings.maxTokens, constraints);
    if (tokensError) {
      errors.maxTokens = tokensError;
      hasErrors = true;
      if (!validateAll) {
        return { valid: false, errors };
      }
    }
  }

  return { valid: !hasErrors, errors };
}

/**
 * Validate complete settings object (all fields required)
 */
export function validateCompleteSettings(
  settings: AISettings,
  options: SettingsValidationOptions = {}
): SettingsValidationResult {
  const result = validateSettings(settings, options);

  // Ensure all required fields are present
  if (!settings.model) {
    result.errors.model = 'Model is required';
    result.valid = false;
  }

  if (settings.temperature === undefined || settings.temperature === null) {
    result.errors.temperature = 'Temperature is required';
    result.valid = false;
  }

  if (settings.maxTokens === undefined || settings.maxTokens === null) {
    result.errors.maxTokens = 'Max tokens is required';
    result.valid = false;
  }

  return result;
}

/**
 * Normalize settings values to ensure they meet constraints
 */
export function normalizeSettings(
  settings: AISettings,
  constraints: SettingsConstraints = SETTINGS_CONSTRAINTS
): AISettings {
  return {
    model: constraints.allowedModels.includes(settings.model)
      ? settings.model
      : DEFAULT_SETTINGS.model,
    temperature: Math.max(
      constraints.temperature.min,
      Math.min(
        constraints.temperature.max,
        Math.round(settings.temperature / constraints.temperature.step) *
          constraints.temperature.step
      )
    ),
    maxTokens: Math.max(
      constraints.maxTokens.min,
      Math.min(
        constraints.maxTokens.max,
        Math.round(settings.maxTokens)
      )
    ),
  };
}

/**
 * Load settings from localStorage
 */
export function loadSettings(): AISettings {
  try {
    if (!isLocalStorageAvailable()) {
      console.warn('localStorage not available, using default settings');
      return { ...DEFAULT_SETTINGS };
    }

    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed: StoredSettings = JSON.parse(stored);

    // Validate and normalize loaded settings
    const validation = validateCompleteSettings(parsed.settings);
    if (!validation.valid) {
      console.warn('Invalid stored settings, using defaults:', validation.errors);
      return { ...DEFAULT_SETTINGS };
    }

    return normalizeSettings(parsed.settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: AISettings): boolean {
  try {
    if (!isLocalStorageAvailable()) {
      throw new SettingsStorageError('localStorage not available');
    }

    // Validate settings before saving
    const validation = validateCompleteSettings(settings);
    if (!validation.valid) {
      throw new SettingsValidationError(
        'Invalid settings',
        validation.errors
      );
    }

    // Normalize settings before saving
    const normalized = normalizeSettings(settings);

    const metadata: SettingsMetadata = {
      lastModified: Date.now(),
      version: SETTINGS_VERSION,
    };

    const stored: StoredSettings = {
      settings: normalized,
      metadata,
    };

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch (error) {
    if (error instanceof SettingsStorageError) {
      throw error;
    }
    throw new SettingsStorageError(
      'Failed to save settings',
      error as Error
    );
  }
}

/**
 * Update partial settings
 */
export function updateSettings(partialSettings: PartialSettings): AISettings {
  const current = loadSettings();
  const updated = { ...current, ...partialSettings };

  // Validate updated settings
  const validation = validateCompleteSettings(updated);
  if (!validation.valid) {
    throw new SettingsValidationError(
      'Invalid settings update',
      validation.errors
    );
  }

  saveSettings(updated);
  return updated;
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): AISettings {
  const defaults = { ...DEFAULT_SETTINGS };
  saveSettings(defaults);
  return defaults;
}

/**
 * Clear settings from storage
 */
export function clearSettings(): boolean {
  try {
    if (!isLocalStorageAvailable()) {
      return false;
    }

    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear settings:', error);
    return false;
  }
}

/**
 * Get settings metadata
 */
export function getSettingsMetadata(): SettingsMetadata | null {
  try {
    if (!isLocalStorageAvailable()) {
      return null;
    }

    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed: StoredSettings = JSON.parse(stored);
    return parsed.metadata;
  } catch (error) {
    console.error('Failed to get settings metadata:', error);
    return null;
  }
}

/**
 * Check if settings exist in storage
 */
export function hasStoredSettings(): boolean {
  try {
    if (!isLocalStorageAvailable()) {
      return false;
    }

    return localStorage.getItem(SETTINGS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
