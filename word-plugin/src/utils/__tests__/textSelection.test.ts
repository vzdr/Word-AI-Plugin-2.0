/**
 * Comprehensive tests for textSelection.ts
 *
 * Tests text selection utilities for Office.js Word API:
 * - Selection metadata extraction
 * - Text selection retrieval
 * - Selection replacement
 * - Location detection (body, header, footer, etc.)
 * - Edge cases and error scenarios
 */

import {
  getTextSelection,
  replaceSelection,
  getSelectionMetadata,
  SelectionInfo,
  SelectionLocation,
} from '../textSelection';
import * as logger from '../logger';

// Mock logger module
jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logAsyncOperation: {
    start: jest.fn(),
    success: jest.fn(),
    failure: jest.fn(),
  },
  logValidation: {
    pass: jest.fn(),
    fail: jest.fn(),
  },
}));

// Mock Word global
declare global {
  namespace Word {
    function run<T>(callback: (context: RequestContext) => Promise<T>): Promise<T>;

    interface RequestContext {
      document: Document;
      sync(): Promise<void>;
    }

    interface Document {
      getSelection(): Range;
    }

    interface Range {
      text: string;
      paragraphs: ParagraphCollection;
      parentBody: Body;
      load(properties: string | string[]): void;
      insertText(text: string, location: string): void;
    }

    interface ParagraphCollection {
      items: Paragraph[];
    }

    interface Paragraph {}

    interface Body {
      type: string;
      load(properties: string | string[]): void;
    }

    namespace InsertLocation {
      const replace: string;
    }
  }
}

(global as any).Word = {
  run: jest.fn(),
  InsertLocation: {
    replace: 'Replace',
  },
};

describe('textSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create mock Word context
  function createMockContext(
    text: string,
    bodyType: string = 'MainDoc',
    paragraphCount: number = 1
  ): Word.RequestContext {
    const mockRange: Partial<Word.Range> = {
      text,
      load: jest.fn(),
      insertText: jest.fn(),
      paragraphs: {
        items: Array(paragraphCount).fill({}),
      } as Word.ParagraphCollection,
      parentBody: {
        type: bodyType,
        load: jest.fn(),
      } as Word.Body,
    };

    return {
      document: {
        getSelection: jest.fn().mockReturnValue(mockRange),
      } as any,
      sync: jest.fn().mockResolvedValue(undefined),
    } as Word.RequestContext;
  }

  describe('getTextSelection', () => {
    it('should get selected text successfully', async () => {
      const mockContext = createMockContext('Selected text', 'MainDoc', 1);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(true);
      expect(result.text).toBe('Selected text');
      expect(result.location).toBe('body');
      expect(result.paragraphCount).toBe(1);
    });

    it('should detect body location', async () => {
      const mockContext = createMockContext('Text', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('body');
    });

    it('should detect Document as body location', async () => {
      const mockContext = createMockContext('Text', 'Document');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('body');
    });

    it('should detect header location', async () => {
      const mockContext = createMockContext('Header text', 'Header');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('header');
    });

    it('should detect footer location', async () => {
      const mockContext = createMockContext('Footer text', 'Footer');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('footer');
    });

    it('should detect unknown location for unrecognized types', async () => {
      const mockContext = createMockContext('Text', 'UnknownType');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('unknown');
    });

    it('should handle empty selection', async () => {
      const mockContext = createMockContext('', 'MainDoc', 0);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
      expect(result.text).toBe('');
      expect(result.paragraphCount).toBe(0);
      expect(result.error).toContain('No text selected');
    });

    it('should handle whitespace-only selection', async () => {
      const mockContext = createMockContext('   \n\t  ', 'MainDoc', 1);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No text selected');
    });

    it('should count multiple paragraphs', async () => {
      const mockContext = createMockContext('Multi-paragraph text', 'MainDoc', 3);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.paragraphCount).toBe(3);
    });

    it('should handle errors when determining location', async () => {
      const mockRange: Partial<Word.Range> = {
        text: 'Text',
        load: jest.fn(),
        paragraphs: { items: [{}] } as Word.ParagraphCollection,
        parentBody: {
          type: 'MainDoc',
          load: jest.fn(),
        } as Word.Body,
      };

      // Make parentBody.type throw an error
      Object.defineProperty(mockRange.parentBody!, 'type', {
        get: () => {
          throw new Error('Cannot access type');
        },
      });

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      } as any;

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('unknown');
      expect(logger.logger.warn).toHaveBeenCalledWith(
        'Could not determine selection location',
        expect.any(Object)
      );
    });

    it('should handle Word API errors', async () => {
      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        const mockContext = {
          document: {
            getSelection: jest.fn().mockImplementation(() => {
              throw new Error('Word API error');
            }),
          },
          sync: jest.fn(),
        };
        return await callback(mockContext as any);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to get selection');
    });

    it('should log async operation', async () => {
      const mockContext = createMockContext('Text', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      await getTextSelection();

      expect(logger.logAsyncOperation.start).toHaveBeenCalledWith(
        'Get text selection from Word document'
      );
      expect(logger.logAsyncOperation.success).toHaveBeenCalled();
    });

    it('should log validation failure for empty selection', async () => {
      const mockContext = createMockContext('', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      await getTextSelection();

      expect(logger.logValidation.fail).toHaveBeenCalledWith(
        'Text selection validation',
        expect.objectContaining({
          reason: 'Empty selection',
        })
      );
    });
  });

  describe('replaceSelection', () => {
    it('should replace selection successfully', async () => {
      const mockRange = {
        insertText: jest.fn(),
      };

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      const result = await replaceSelection('New text');

      expect(result).toBe(true);
      expect(mockRange.insertText).toHaveBeenCalledWith('New text', 'Replace');
    });

    it('should handle replacement errors', async () => {
      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        const mockContext = {
          document: {
            getSelection: jest.fn().mockImplementation(() => {
              throw new Error('Replacement failed');
            }),
          },
          sync: jest.fn(),
        };
        return await callback(mockContext as any);
      });

      const result = await replaceSelection('New text');

      expect(result).toBe(false);
    });

    it('should log replacement operation', async () => {
      const mockRange = {
        insertText: jest.fn(),
      };

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      await replaceSelection('New text');

      expect(logger.logAsyncOperation.start).toHaveBeenCalledWith(
        'Replace selection',
        { newTextLength: 8 }
      );
      expect(logger.logAsyncOperation.success).toHaveBeenCalledWith(
        'Replace selection',
        { newTextLength: 8 }
      );
    });

    it('should replace with empty string', async () => {
      const mockRange = {
        insertText: jest.fn(),
      };

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      const result = await replaceSelection('');

      expect(result).toBe(true);
      expect(mockRange.insertText).toHaveBeenCalledWith('', 'Replace');
    });

    it('should replace with long text', async () => {
      const longText = 'A'.repeat(10000);
      const mockRange = {
        insertText: jest.fn(),
      };

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      const result = await replaceSelection(longText);

      expect(result).toBe(true);
      expect(mockRange.insertText).toHaveBeenCalledWith(longText, 'Replace');
    });
  });

  describe('getSelectionMetadata', () => {
    it('should get metadata for non-empty selection', async () => {
      const mockContext = createMockContext('Selected text', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.isEmpty).toBe(false);
      expect(metadata.location).toBe('body');
      expect(metadata.characterCount).toBe(13);
    });

    it('should get metadata for empty selection', async () => {
      const mockContext = createMockContext('', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.isEmpty).toBe(true);
      expect(metadata.characterCount).toBe(0);
    });

    it('should detect location in metadata', async () => {
      const mockContext = createMockContext('Text', 'Header');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.location).toBe('header');
    });

    it('should count characters accurately', async () => {
      const text = 'Hello World 123';
      const mockContext = createMockContext(text, 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.characterCount).toBe(text.length);
    });

    it('should handle whitespace-only as empty', async () => {
      const mockContext = createMockContext('   \n\t  ', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.isEmpty).toBe(true);
    });

    it('should handle error when determining location', async () => {
      const mockRange: Partial<Word.Range> = {
        text: 'Text',
        load: jest.fn(),
        parentBody: {
          type: 'MainDoc',
          load: jest.fn(),
        } as Word.Body,
      };

      Object.defineProperty(mockRange.parentBody!, 'type', {
        get: () => {
          throw new Error('Cannot access type');
        },
      });

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      } as any;

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const metadata = await getSelectionMetadata();

      expect(metadata.location).toBe('unknown');
      expect(logger.logger.warn).toHaveBeenCalled();
    });

    it('should log debug information', async () => {
      const mockContext = createMockContext('Text', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      await getSelectionMetadata();

      expect(logger.logger.debug).toHaveBeenCalledWith('Getting selection metadata');
      expect(logger.logger.debug).toHaveBeenCalledWith(
        'Selection metadata retrieved',
        expect.any(Object)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long selections', async () => {
      const longText = 'A'.repeat(100000);
      const mockContext = createMockContext(longText, 'MainDoc', 1);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(true);
      expect(result.text.length).toBe(100000);
    });

    it('should handle special characters', async () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t';
      const mockContext = createMockContext(specialText, 'MainDoc', 1);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(true);
      expect(result.text).toBe(specialText);
    });

    it('should handle Unicode characters', async () => {
      const unicodeText = '你好世界 🌍 Привет мир';
      const mockContext = createMockContext(unicodeText, 'MainDoc', 1);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(true);
      expect(result.text).toBe(unicodeText);
    });

    it('should handle large paragraph count', async () => {
      const mockContext = createMockContext('Text', 'MainDoc', 100);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.paragraphCount).toBe(100);
    });

    it('should handle various body types with "Header" in name', async () => {
      const mockContext = createMockContext('Text', 'HeaderPrimary');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('header');
    });

    it('should handle various body types with "Footer" in name', async () => {
      const mockContext = createMockContext('Text', 'FooterPrimary');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      expect(result.location).toBe('footer');
    });
  });

  describe('error scenarios', () => {
    it('should handle sync errors', async () => {
      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue({
            text: 'Text',
            load: jest.fn(),
            paragraphs: { items: [{}] },
            parentBody: { type: 'MainDoc', load: jest.fn() },
          }),
        },
        sync: jest.fn().mockRejectedValue(new Error('Sync failed')),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to get selection');
    });

    it('should handle null selection range', async () => {
      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(null),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      };

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext as any);
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
    });

    it('should handle missing paragraphs property', async () => {
      const mockRange: Partial<Word.Range> = {
        text: 'Text',
        load: jest.fn(),
        parentBody: {
          type: 'MainDoc',
          load: jest.fn(),
        } as Word.Body,
        // Missing paragraphs
      };

      const mockContext = {
        document: {
          getSelection: jest.fn().mockReturnValue(mockRange),
        },
        sync: jest.fn().mockResolvedValue(undefined),
      } as any;

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await getTextSelection();

      // Should handle gracefully
      expect(result.isValid).toBe(true);
      expect(result.text).toBe('Text');
    });

    it('should handle non-Error rejections', async () => {
      (Word.run as jest.Mock).mockImplementation(async () => {
        throw 'String error';
      });

      const result = await getTextSelection();

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Unknown error');
    });
  });
});
