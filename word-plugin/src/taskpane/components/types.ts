/**
 * TypeScript interfaces for coordination between UI components and storage utilities
 * These interfaces are shared between Stream A (UI) and Stream B (Storage)
 */

/**
 * Interface for inline context data
 * Used by InlineContext component and storage utilities
 */
export interface InlineContextData {
  value: string;
  lastUpdated?: number;
}

/**
 * Storage key constants
 */
export const STORAGE_KEYS = {
  INLINE_CONTEXT: 'word_ai_plugin_inline_context',
  FILE_CONTEXT: 'word_ai_plugin_file_context',
  USER_PREFERENCES: 'word_ai_plugin_preferences'
} as const;

/**
 * Hook return type for session storage
 * This interface will be implemented by Stream B
 */
export interface UseSessionStorageReturn<T> {
  value: T;
  setValue: (value: T) => void;
  clearValue: () => void;
  isLoading: boolean;
  error: Error | null;
}
