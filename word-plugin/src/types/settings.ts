/**
 * Settings-related type definitions for Word AI Plugin
 * Defines interfaces for AI model configuration and settings management
 */

/**
 * Available AI models
 */
export type AIModel = 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo';

/**
 * AI settings configuration
 */
export interface AISettings {
  model: AIModel;
  temperature: number;
  maxTokens: number;
}

/**
 * Default settings configuration
 */
export const DEFAULT_SETTINGS: AISettings = {
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2000,
};

/**
 * Settings validation constraints
 */
export interface SettingsConstraints {
  temperature: {
    min: number;
    max: number;
    step: number;
  };
  maxTokens: {
    min: number;
    max: number;
  };
  allowedModels: AIModel[];
}

/**
 * Default validation constraints
 */
export const SETTINGS_CONSTRAINTS: SettingsConstraints = {
  temperature: {
    min: 0.0,
    max: 1.0,
    step: 0.1,
  },
  maxTokens: {
    min: 100,
    max: 4000,
  },
  allowedModels: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
};

/**
 * Settings validation result
 */
export interface SettingsValidationResult {
  valid: boolean;
  errors: SettingsValidationErrors;
}

/**
 * Settings validation errors by field
 */
export interface SettingsValidationErrors {
  model?: string;
  temperature?: string;
  maxTokens?: string;
}

/**
 * Partial settings for updates
 */
export type PartialSettings = Partial<AISettings>;

/**
 * Settings validation options
 */
export interface SettingsValidationOptions {
  constraints?: SettingsConstraints;
  validateAll?: boolean; // If true, validate all fields even if some are invalid
}

/**
 * Settings storage metadata
 */
export interface SettingsMetadata {
  lastModified: number;
  version: string;
}

/**
 * Stored settings with metadata
 */
export interface StoredSettings {
  settings: AISettings;
  metadata: SettingsMetadata;
}
