import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AISettings,
  AIModel,
  DEFAULT_SETTINGS,
  PartialSettings,
  SettingsValidationResult,
  SettingsValidationErrors,
} from '../types/settings';
import {
  loadSettings,
  saveSettings,
  updateSettings,
  resetSettings as resetStorageSettings,
  validateSettings,
  validateCompleteSettings,
  SettingsStorageError,
  SettingsValidationError,
} from '../utils/settingsStorage';

/**
 * Hook options
 */
export interface UseSettingsOptions {
  autoSave?: boolean; // Auto-save on change (default: true)
  autoSaveDelay?: number; // Delay in ms before auto-saving (default: 500ms)
  onSaveSuccess?: (settings: AISettings) => void;
  onSaveError?: (error: SettingsStorageError) => void;
  onLoadError?: (error: Error) => void;
  onValidationError?: (errors: SettingsValidationErrors) => void;
}

/**
 * Hook return type
 */
export interface UseSettingsReturn {
  // Current settings
  settings: AISettings;

  // Individual setting getters
  model: AIModel;
  temperature: number;
  maxTokens: number;

  // Setters for individual settings
  setModel: (model: AIModel) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;

  // Batch update
  updateSettings: (partial: PartialSettings) => void;

  // Full settings replacement
  setSettings: (settings: AISettings) => void;

  // Validation
  validate: (partial?: PartialSettings) => SettingsValidationResult;
  isValid: boolean;
  validationErrors: SettingsValidationErrors;

  // Storage operations
  save: () => Promise<boolean>;
  reset: () => void;

  // State flags
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: number | null;

  // Errors
  error: SettingsStorageError | null;
}

/**
 * Custom hook for settings management with persistence
 *
 * @param options - Configuration options
 * @returns Settings state and control functions
 *
 * @example
 * ```tsx
 * const {
 *   settings,
 *   model,
 *   setModel,
 *   temperature,
 *   setTemperature,
 *   isValid,
 *   save,
 *   reset
 * } = useSettings({ autoSave: true });
 * ```
 */
export function useSettings(
  options: UseSettingsOptions = {}
): UseSettingsReturn {
  const {
    autoSave = true,
    autoSaveDelay = 500,
    onSaveSuccess,
    onSaveError,
    onLoadError,
    onValidationError,
  } = options;

  // State
  const [settings, setSettingsState] = useState<AISettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [error, setError] = useState<SettingsStorageError | null>(null);
  const [validationErrors, setValidationErrors] =
    useState<SettingsValidationErrors>({});

  // Refs
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const lastSavedSettingsRef = useRef<AISettings>(DEFAULT_SETTINGS);

  /**
   * Load initial settings from storage
   */
  useEffect(() => {
    mountedRef.current = true;

    const loadInitialSettings = async () => {
      try {
        const loaded = loadSettings();
        if (mountedRef.current) {
          setSettingsState(loaded);
          lastSavedSettingsRef.current = loaded;

          // Validate loaded settings
          const validation = validateCompleteSettings(loaded);
          if (!validation.valid) {
            setValidationErrors(validation.errors);
            if (onValidationError) {
              onValidationError(validation.errors);
            }
          }
        }
      } catch (err) {
        const error = err as Error;
        console.error('Failed to load settings:', error);
        if (onLoadError) {
          onLoadError(error);
        }
        // Fall back to defaults
        if (mountedRef.current) {
          setSettingsState(DEFAULT_SETTINGS);
          lastSavedSettingsRef.current = DEFAULT_SETTINGS;
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadInitialSettings();

    return () => {
      mountedRef.current = false;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [onLoadError, onValidationError]);

  /**
   * Save settings to storage
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;

    // Validate before saving
    const validation = validateCompleteSettings(settings);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      if (onValidationError) {
        onValidationError(validation.errors);
      }
      const validationError = new SettingsValidationError(
        'Cannot save invalid settings',
        validation.errors
      );
      setError(validationError);
      if (onSaveError) {
        onSaveError(validationError);
      }
      return false;
    }

    setIsSaving(true);
    setError(null);
    setValidationErrors({});

    try {
      const success = saveSettings(settings);

      if (mountedRef.current && success) {
        setIsSaving(false);
        setHasUnsavedChanges(false);
        setLastSaved(Date.now());
        lastSavedSettingsRef.current = settings;

        if (onSaveSuccess) {
          onSaveSuccess(settings);
        }
      }

      return success;
    } catch (err) {
      const saveError =
        err instanceof SettingsStorageError
          ? err
          : new SettingsStorageError('Failed to save settings', err as Error);

      if (mountedRef.current) {
        setIsSaving(false);
        setError(saveError);
      }

      if (onSaveError) {
        onSaveError(saveError);
      }

      return false;
    }
  }, [settings, onSaveSuccess, onSaveError, onValidationError]);

  /**
   * Auto-save handler
   */
  const scheduleAutoSave = useCallback(() => {
    if (!autoSave || autoSaveDelay <= 0) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Schedule new save
    autoSaveTimerRef.current = setTimeout(() => {
      save();
    }, autoSaveDelay);
  }, [autoSave, autoSaveDelay, save]);

  /**
   * Update settings state and trigger auto-save
   */
  const updateSettingsState = useCallback(
    (newSettings: AISettings) => {
      if (!mountedRef.current) return;

      setSettingsState(newSettings);
      setHasUnsavedChanges(true);

      // Validate new settings
      const validation = validateCompleteSettings(newSettings);
      if (validation.valid) {
        setValidationErrors({});
      } else {
        setValidationErrors(validation.errors);
        if (onValidationError) {
          onValidationError(validation.errors);
        }
      }

      scheduleAutoSave();
    },
    [scheduleAutoSave, onValidationError]
  );

  /**
   * Set model
   */
  const setModel = useCallback(
    (model: AIModel) => {
      updateSettingsState({ ...settings, model });
    },
    [settings, updateSettingsState]
  );

  /**
   * Set temperature
   */
  const setTemperature = useCallback(
    (temperature: number) => {
      updateSettingsState({ ...settings, temperature });
    },
    [settings, updateSettingsState]
  );

  /**
   * Set max tokens
   */
  const setMaxTokens = useCallback(
    (maxTokens: number) => {
      updateSettingsState({ ...settings, maxTokens });
    },
    [settings, updateSettingsState]
  );

  /**
   * Update partial settings
   */
  const updateSettingsPartial = useCallback(
    (partial: PartialSettings) => {
      const updated = { ...settings, ...partial };
      updateSettingsState(updated);
    },
    [settings, updateSettingsState]
  );

  /**
   * Set complete settings
   */
  const setSettings = useCallback(
    (newSettings: AISettings) => {
      updateSettingsState(newSettings);
    },
    [updateSettingsState]
  );

  /**
   * Validate settings (current or partial update)
   */
  const validate = useCallback(
    (partial?: PartialSettings): SettingsValidationResult => {
      const toValidate = partial ? { ...settings, ...partial } : settings;
      return validateCompleteSettings(toValidate);
    },
    [settings]
  );

  /**
   * Reset settings to defaults
   */
  const reset = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const defaults = resetStorageSettings();
      setSettingsState(defaults);
      lastSavedSettingsRef.current = defaults;
      setHasUnsavedChanges(false);
      setValidationErrors({});
      setError(null);
      setLastSaved(Date.now());

      if (onSaveSuccess) {
        onSaveSuccess(defaults);
      }
    } catch (err) {
      const resetError =
        err instanceof SettingsStorageError
          ? err
          : new SettingsStorageError('Failed to reset settings', err as Error);

      setError(resetError);
      if (onSaveError) {
        onSaveError(resetError);
      }
    }
  }, [onSaveSuccess, onSaveError]);

  /**
   * Check if current settings are valid
   */
  const isValid = Object.keys(validationErrors).length === 0;

  return {
    // Current settings
    settings,

    // Individual setting getters
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,

    // Setters
    setModel,
    setTemperature,
    setMaxTokens,
    updateSettings: updateSettingsPartial,
    setSettings,

    // Validation
    validate,
    isValid,
    validationErrors,

    // Storage operations
    save,
    reset,

    // State flags
    isLoading,
    isSaving,
    hasUnsavedChanges,
    lastSaved,

    // Errors
    error,
  };
}
