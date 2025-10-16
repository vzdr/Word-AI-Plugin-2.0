/**
 * Text Selection Utilities for Office.js Word API
 *
 * Handles text selection across various document contexts including:
 * - Body text
 * - Headers and footers
 * - Text boxes
 * - Tables
 * - Multi-paragraph selections
 */

import { logger, logAsyncOperation, logValidation } from './logger';

export interface SelectionInfo {
  text: string;
  location: SelectionLocation;
  paragraphCount: number;
  isValid: boolean;
  error?: string;
}

export type SelectionLocation =
  | 'body'
  | 'header'
  | 'footer'
  | 'textBox'
  | 'table'
  | 'unknown';

/**
 * Get current text selection with detailed context
 */
export async function getTextSelection(): Promise<SelectionInfo> {
  logAsyncOperation.start('Get text selection from Word document');

  return Word.run(async (context) => {
    try {
      const range = context.document.getSelection();

      // Load text and paragraph properties
      range.load('text');
      range.load('paragraphs');

      // Try to determine location context
      const parentBody = range.parentBody;
      parentBody.load('type');

      await context.sync();

      const text = range.text;
      const paragraphCount = range.paragraphs.items.length;

      // Determine location
      let location: SelectionLocation = 'body';
      try {
        const bodyType = parentBody.type as string;
        if (bodyType === 'MainDoc' || bodyType === 'Document') {
          location = 'body';
        } else if (bodyType.includes('Header')) {
          location = 'header';
        } else if (bodyType.includes('Footer')) {
          location = 'footer';
        } else {
          location = 'unknown';
        }
      } catch (e) {
        logger.warn('Could not determine selection location', {
          error: e instanceof Error ? e.message : String(e)
        });
        location = 'unknown';
      }

      // Check if empty selection
      if (!text || text.trim().length === 0) {
        logValidation.fail('Text selection validation', {
          reason: 'Empty selection',
          location
        });
        return {
          text: '',
          location,
          paragraphCount: 0,
          isValid: false,
          error: 'No text selected. Please select some text in the document.'
        };
      }

      logAsyncOperation.success('Get text selection', {
        textLength: text.length,
        location,
        paragraphCount
      });

      return {
        text,
        location,
        paragraphCount,
        isValid: true
      };

    } catch (error) {
      logAsyncOperation.failure('Get text selection', error instanceof Error ? error : new Error(String(error)), {
        operation: 'getTextSelection'
      });
      return {
        text: '',
        location: 'unknown',
        paragraphCount: 0,
        isValid: false,
        error: `Failed to get selection: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  });
}

/**
 * Replace current selection with new text
 */
export async function replaceSelection(newText: string): Promise<boolean> {
  logAsyncOperation.start('Replace selection', { newTextLength: newText.length });

  return Word.run(async (context) => {
    try {
      const range = context.document.getSelection();
      range.insertText(newText, Word.InsertLocation.replace);
      await context.sync();

      logAsyncOperation.success('Replace selection', { newTextLength: newText.length });
      return true;
    } catch (error) {
      logAsyncOperation.failure('Replace selection', error instanceof Error ? error : new Error(String(error)), {
        newTextLength: newText.length
      });
      return false;
    }
  });
}

/**
 * Get selection metadata without loading heavy content
 */
export async function getSelectionMetadata(): Promise<{
  isEmpty: boolean;
  location: SelectionLocation;
  characterCount: number;
}> {
  logger.debug('Getting selection metadata');

  return Word.run(async (context) => {
    const range = context.document.getSelection();
    range.load('text');
    const parentBody = range.parentBody;
    parentBody.load('type');

    await context.sync();

    const text = range.text;
    let location: SelectionLocation = 'body';

    try {
      const bodyType = parentBody.type as string;
      if (bodyType === 'MainDoc' || bodyType === 'Document') {
        location = 'body';
      } else if (bodyType.includes('Header')) {
        location = 'header';
      } else if (bodyType.includes('Footer')) {
        location = 'footer';
      }
    } catch (e) {
      logger.warn('Could not determine location in getSelectionMetadata', {
        error: e instanceof Error ? e.message : String(e)
      });
      location = 'unknown';
    }

    const metadata = {
      isEmpty: !text || text.trim().length === 0,
      location,
      characterCount: text ? text.length : 0
    };

    logger.debug('Selection metadata retrieved', metadata);

    return metadata;
  });
}
