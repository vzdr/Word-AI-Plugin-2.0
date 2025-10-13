/**
 * Text Replacement type definitions for Word AI Plugin
 * Defines interfaces for text replacement operations with Office.js Word API
 */

import { SelectionLocation } from '../utils/textSelection';

/**
 * Options for text replacement operations
 */
export interface ReplacementOptions {
  /**
   * Whether to preserve original formatting (font, color, size, etc.)
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Whether to enable track changes for this replacement
   * @default false
   */
  trackChanges?: boolean;

  /**
   * Whether to use HTML for rich text replacement
   * If true, newText is treated as HTML; if false, as plain text
   * @default false
   */
  useHtml?: boolean;

  /**
   * Whether to validate selection before replacement
   * @default true
   */
  validateSelection?: boolean;

  /**
   * Whether to select the newly inserted text after replacement
   * @default false
   */
  selectAfterReplace?: boolean;
}

/**
 * Formatting information captured from original text
 */
export interface TextFormatting {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: string;
  highlightColor?: string;
  strikeThrough?: boolean;
  subscript?: boolean;
  superscript?: boolean;
}

/**
 * Location information for replaced text
 */
export interface ReplacementLocation {
  /**
   * Document area where replacement occurred
   */
  type: SelectionLocation;

  /**
   * Paragraph index (if applicable)
   */
  paragraphIndex?: number;

  /**
   * Character position in document
   */
  characterPosition?: number;
}

/**
 * Result of a text replacement operation
 */
export interface ReplacementResult {
  /**
   * Whether the replacement was successful
   */
  success: boolean;

  /**
   * Original text that was replaced
   */
  originalText: string;

  /**
   * New text that replaced the original
   */
  newText: string;

  /**
   * Location where replacement occurred
   */
  location: ReplacementLocation;

  /**
   * Formatting that was preserved (if applicable)
   */
  preservedFormatting?: TextFormatting;

  /**
   * Character count of replaced text
   */
  originalLength: number;

  /**
   * Character count of new text
   */
  newLength: number;

  /**
   * Timestamp of replacement operation
   */
  timestamp: number;

  /**
   * Error information if replacement failed
   */
  error?: string;

  /**
   * Error code for categorizing failures
   */
  errorCode?: ReplacementErrorCode;
}

/**
 * Error codes for replacement operations
 */
export enum ReplacementErrorCode {
  NO_SELECTION = 'NO_SELECTION',
  EMPTY_SELECTION = 'EMPTY_SELECTION',
  INVALID_RANGE = 'INVALID_RANGE',
  FORMATTING_ERROR = 'FORMATTING_ERROR',
  INSERTION_ERROR = 'INSERTION_ERROR',
  CONTEXT_ERROR = 'CONTEXT_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Validation result for replacement operation
 */
export interface ReplacementValidation {
  /**
   * Whether the replacement can proceed
   */
  valid: boolean;

  /**
   * Validation error message
   */
  error?: string;

  /**
   * Validation error code
   */
  errorCode?: ReplacementErrorCode;

  /**
   * Selection information if valid
   */
  selectionInfo?: {
    hasSelection: boolean;
    isEmpty: boolean;
    location: SelectionLocation;
    characterCount: number;
  };
}

/**
 * Default replacement options
 */
export const DEFAULT_REPLACEMENT_OPTIONS: Required<ReplacementOptions> = {
  preserveFormatting: true,
  trackChanges: false,
  useHtml: false,
  validateSelection: true,
  selectAfterReplace: false,
};
