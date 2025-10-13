/**
 * Text Replacement Utilities for Office.js Word API
 *
 * Provides comprehensive text replacement functionality with:
 * - Formatting preservation (bold, italic, font, color, etc.)
 * - Support for body, header, footer, table, and text box contexts
 * - Rich text (HTML) replacement support
 * - Detailed error handling and validation
 * - Automatic undo/redo compatibility
 */

import {
  ReplacementOptions,
  ReplacementResult,
  ReplacementErrorCode,
  ReplacementValidation,
  TextFormatting,
  ReplacementLocation,
  DEFAULT_REPLACEMENT_OPTIONS,
} from '../types/replacement';
import { getSelectionMetadata, SelectionLocation } from './textSelection';

/**
 * Replace selected text with new content while preserving formatting
 *
 * @param newText - The text to insert (plain text or HTML based on options)
 * @param options - Replacement options for controlling behavior
 * @returns Promise resolving to detailed replacement result
 *
 * @example
 * ```typescript
 * const result = await replaceSelectedText('New content', {
 *   preserveFormatting: true,
 *   useHtml: false
 * });
 * if (result.success) {
 *   console.log(`Replaced ${result.originalLength} characters`);
 * }
 * ```
 */
export async function replaceSelectedText(
  newText: string,
  options: ReplacementOptions = {}
): Promise<ReplacementResult> {
  const opts = { ...DEFAULT_REPLACEMENT_OPTIONS, ...options };

  return Word.run(async (context) => {
    try {
      // Validate selection if requested
      if (opts.validateSelection) {
        const validation = await validateSelectionForReplacement();
        if (!validation.valid) {
          return createErrorResult(
            '',
            newText,
            validation.error || 'Invalid selection',
            validation.errorCode || ReplacementErrorCode.INVALID_RANGE
          );
        }
      }

      const range = context.document.getSelection();

      // Load necessary properties
      range.load('text');
      const parentBody = range.parentBody;
      parentBody.load('type');

      // Load formatting if we need to preserve it
      let formatting: TextFormatting | undefined;
      if (opts.preserveFormatting) {
        const font = range.font;
        font.load([
          'name',
          'size',
          'color',
          'bold',
          'italic',
          'underline',
          'highlightColor',
          'strikeThrough',
          'subscript',
          'superscript',
        ]);
        await context.sync();

        formatting = {
          fontFamily: font.name,
          fontSize: font.size,
          fontColor: font.color,
          bold: font.bold,
          italic: font.italic,
          underline: font.underline,
          highlightColor: font.highlightColor,
          strikeThrough: font.strikeThrough,
          subscript: font.subscript,
          superscript: font.superscript,
        };
      } else {
        await context.sync();
      }

      const originalText = range.text;
      const originalLength = originalText.length;

      // Determine location
      const location = determineLocation(parentBody.type as string);

      // Perform the replacement
      let newRange: Word.Range;
      if (opts.useHtml) {
        newRange = range.insertHtml(newText, Word.InsertLocation.replace);
      } else {
        newRange = range.insertText(newText, Word.InsertLocation.replace);
      }

      // Apply preserved formatting if not using HTML
      if (opts.preserveFormatting && !opts.useHtml && formatting) {
        await applyFormatting(newRange, formatting, context);
      }

      // Select the new text if requested
      if (opts.selectAfterReplace) {
        newRange.select();
      }

      await context.sync();

      return {
        success: true,
        originalText,
        newText,
        location: {
          type: location,
        },
        preservedFormatting: formatting,
        originalLength,
        newLength: newText.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error replacing text:', error);
      return createErrorResult(
        '',
        newText,
        `Replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ReplacementErrorCode.INSERTION_ERROR
      );
    }
  });
}

/**
 * Replace text in a specific range with new content
 *
 * @param range - The Word.Range object to replace
 * @param newText - The text to insert
 * @param options - Replacement options
 * @param context - Word context for the operation
 * @returns Promise resolving to replacement result
 *
 * @example
 * ```typescript
 * await Word.run(async (context) => {
 *   const range = context.document.getSelection();
 *   const result = await replaceTextInRange(range, 'New text', {}, context);
 *   await context.sync();
 * });
 * ```
 */
export async function replaceTextInRange(
  range: Word.Range,
  newText: string,
  options: ReplacementOptions,
  context: Word.RequestContext
): Promise<ReplacementResult> {
  const opts = { ...DEFAULT_REPLACEMENT_OPTIONS, ...options };

  try {
    // Load original text
    range.load('text');
    const parentBody = range.parentBody;
    parentBody.load('type');

    // Load formatting if needed
    let formatting: TextFormatting | undefined;
    if (opts.preserveFormatting) {
      const font = range.font;
      font.load([
        'name',
        'size',
        'color',
        'bold',
        'italic',
        'underline',
        'highlightColor',
        'strikeThrough',
        'subscript',
        'superscript',
      ]);
    }

    await context.sync();

    const originalText = range.text;
    const originalLength = originalText.length;

    if (opts.preserveFormatting) {
      const font = range.font;
      formatting = {
        fontFamily: font.name,
        fontSize: font.size,
        fontColor: font.color,
        bold: font.bold,
        italic: font.italic,
        underline: font.underline,
        highlightColor: font.highlightColor,
        strikeThrough: font.strikeThrough,
        subscript: font.subscript,
        superscript: font.superscript,
      };
    }

    // Determine location
    const location = determineLocation(parentBody.type as string);

    // Perform replacement
    let newRange: Word.Range;
    if (opts.useHtml) {
      newRange = range.insertHtml(newText, Word.InsertLocation.replace);
    } else {
      newRange = range.insertText(newText, Word.InsertLocation.replace);
    }

    // Apply formatting if not using HTML
    if (opts.preserveFormatting && !opts.useHtml && formatting) {
      await applyFormatting(newRange, formatting, context);
    }

    if (opts.selectAfterReplace) {
      newRange.select();
    }

    await context.sync();

    return {
      success: true,
      originalText,
      newText,
      location: {
        type: location,
      },
      preservedFormatting: formatting,
      originalLength,
      newLength: newText.length,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Error replacing text in range:', error);
    return createErrorResult(
      '',
      newText,
      `Range replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ReplacementErrorCode.INSERTION_ERROR
    );
  }
}

/**
 * Validate that current selection is suitable for replacement
 *
 * @returns Promise resolving to validation result with detailed info
 *
 * @example
 * ```typescript
 * const validation = await validateSelectionForReplacement();
 * if (!validation.valid) {
 *   alert(validation.error);
 * }
 * ```
 */
export async function validateSelectionForReplacement(): Promise<ReplacementValidation> {
  try {
    const metadata = await getSelectionMetadata();

    if (metadata.isEmpty) {
      return {
        valid: false,
        error: 'No text selected. Please select text to replace.',
        errorCode: ReplacementErrorCode.EMPTY_SELECTION,
        selectionInfo: {
          hasSelection: true,
          isEmpty: true,
          location: metadata.location,
          characterCount: 0,
        },
      };
    }

    return {
      valid: true,
      selectionInfo: {
        hasSelection: true,
        isEmpty: false,
        location: metadata.location,
        characterCount: metadata.characterCount,
      },
    };
  } catch (error) {
    console.error('Error validating selection:', error);
    return {
      valid: false,
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorCode: ReplacementErrorCode.CONTEXT_ERROR,
    };
  }
}

/**
 * Get formatting information from current selection
 *
 * @returns Promise resolving to formatting details or undefined on error
 *
 * @example
 * ```typescript
 * const formatting = await getSelectionFormatting();
 * if (formatting) {
 *   console.log(`Font: ${formatting.fontFamily}, Size: ${formatting.fontSize}`);
 * }
 * ```
 */
export async function getSelectionFormatting(): Promise<TextFormatting | undefined> {
  return Word.run(async (context) => {
    try {
      const range = context.document.getSelection();
      const font = range.font;

      font.load([
        'name',
        'size',
        'color',
        'bold',
        'italic',
        'underline',
        'highlightColor',
        'strikeThrough',
        'subscript',
        'superscript',
      ]);

      await context.sync();

      return {
        fontFamily: font.name,
        fontSize: font.size,
        fontColor: font.color,
        bold: font.bold,
        italic: font.italic,
        underline: font.underline,
        highlightColor: font.highlightColor,
        strikeThrough: font.strikeThrough,
        subscript: font.subscript,
        superscript: font.superscript,
      };
    } catch (error) {
      console.error('Error getting selection formatting:', error);
      return undefined;
    }
  });
}

/**
 * Replace text and apply specific formatting
 *
 * @param newText - The text to insert
 * @param formatting - Formatting to apply to the new text
 * @returns Promise resolving to replacement result
 *
 * @example
 * ```typescript
 * const result = await replaceWithFormatting('Important!', {
 *   bold: true,
 *   fontColor: 'red',
 *   fontSize: 14
 * });
 * ```
 */
export async function replaceWithFormatting(
  newText: string,
  formatting: TextFormatting
): Promise<ReplacementResult> {
  return Word.run(async (context) => {
    try {
      const validation = await validateSelectionForReplacement();
      if (!validation.valid) {
        return createErrorResult(
          '',
          newText,
          validation.error || 'Invalid selection',
          validation.errorCode || ReplacementErrorCode.INVALID_RANGE
        );
      }

      const range = context.document.getSelection();
      range.load('text');
      const parentBody = range.parentBody;
      parentBody.load('type');

      await context.sync();

      const originalText = range.text;
      const originalLength = originalText.length;
      const location = determineLocation(parentBody.type as string);

      // Insert new text
      const newRange = range.insertText(newText, Word.InsertLocation.replace);

      // Apply formatting
      await applyFormatting(newRange, formatting, context);
      await context.sync();

      return {
        success: true,
        originalText,
        newText,
        location: {
          type: location,
        },
        preservedFormatting: formatting,
        originalLength,
        newLength: newText.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Error replacing with formatting:', error);
      return createErrorResult(
        '',
        newText,
        `Formatted replacement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ReplacementErrorCode.FORMATTING_ERROR
      );
    }
  });
}

/**
 * Replace text with HTML content
 *
 * @param html - The HTML content to insert
 * @returns Promise resolving to replacement result
 *
 * @example
 * ```typescript
 * const result = await replaceWithHtml('<strong>Bold text</strong> and <em>italic</em>');
 * ```
 */
export async function replaceWithHtml(html: string): Promise<ReplacementResult> {
  return replaceSelectedText(html, {
    useHtml: true,
    preserveFormatting: false, // HTML defines its own formatting
    validateSelection: true,
  });
}

// Helper functions

/**
 * Apply formatting to a range
 */
async function applyFormatting(
  range: Word.Range,
  formatting: TextFormatting,
  context: Word.RequestContext
): Promise<void> {
  try {
    const font = range.font;

    if (formatting.fontFamily !== undefined) {
      font.name = formatting.fontFamily;
    }
    if (formatting.fontSize !== undefined) {
      font.size = formatting.fontSize;
    }
    if (formatting.fontColor !== undefined) {
      font.color = formatting.fontColor;
    }
    if (formatting.bold !== undefined) {
      font.bold = formatting.bold;
    }
    if (formatting.italic !== undefined) {
      font.italic = formatting.italic;
    }
    if (formatting.underline !== undefined) {
      font.underline = formatting.underline as any;
    }
    if (formatting.highlightColor !== undefined) {
      font.highlightColor = formatting.highlightColor;
    }
    if (formatting.strikeThrough !== undefined) {
      font.strikeThrough = formatting.strikeThrough;
    }
    if (formatting.subscript !== undefined) {
      font.subscript = formatting.subscript;
    }
    if (formatting.superscript !== undefined) {
      font.superscript = formatting.superscript;
    }

    await context.sync();
  } catch (error) {
    console.error('Error applying formatting:', error);
    throw new Error(`Failed to apply formatting: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Determine document location from body type
 */
function determineLocation(bodyType: string): SelectionLocation {
  if (bodyType === 'MainDoc' || bodyType === 'Document') {
    return 'body';
  } else if (bodyType.includes('Header')) {
    return 'header';
  } else if (bodyType.includes('Footer')) {
    return 'footer';
  } else if (bodyType.includes('TextBox')) {
    return 'textBox';
  } else if (bodyType.includes('Table')) {
    return 'table';
  }
  return 'unknown';
}

/**
 * Create an error result object
 */
function createErrorResult(
  originalText: string,
  newText: string,
  error: string,
  errorCode: ReplacementErrorCode
): ReplacementResult {
  return {
    success: false,
    originalText,
    newText,
    location: {
      type: 'unknown',
    },
    originalLength: originalText.length,
    newLength: newText.length,
    timestamp: Date.now(),
    error,
    errorCode,
  };
}
