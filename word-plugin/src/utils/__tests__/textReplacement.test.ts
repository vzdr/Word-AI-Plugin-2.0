/**
 * Comprehensive tests for text replacement utilities
 *
 * Tests the replaceSelectedText function and related utilities
 * with various scenarios, formatting preservation, and error handling.
 *
 * Note: These tests mock Office.js Word API since it's not available in Node.js environment
 */

import {
  replaceSelectedText,
  replaceTextInRange,
  validateSelectionForReplacement,
  getSelectionFormatting,
  replaceWithFormatting,
  replaceWithHtml,
} from '../textReplacement';
import {
  ReplacementOptions,
  ReplacementErrorCode,
  TextFormatting,
} from '../../types/replacement';

// Mock Office.js global
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
      font: Font;
      parentBody: Body;
      load(properties: string | string[]): void;
      insertText(text: string, location: string): Range;
      insertHtml(html: string, location: string): Range;
      select(): void;
    }

    interface Font {
      name: string;
      size: number;
      color: string;
      bold: boolean;
      italic: boolean;
      underline: string;
      highlightColor: string;
      strikeThrough: boolean;
      subscript: boolean;
      superscript: boolean;
      load(properties: string[]): void;
    }

    interface Body {
      type: string;
      load(properties: string | string[]): void;
    }

    namespace InsertLocation {
      const replace: string;
    }
  }
}

// Mock Word global
(global as any).Word = {
  run: jest.fn(),
  InsertLocation: {
    replace: 'Replace',
  },
};

// Helper to create mock Word context
function createMockContext(
  selectedText: string,
  bodyType: string = 'MainDoc',
  formatting?: Partial<TextFormatting>
): Word.RequestContext {
  const mockRange: Partial<Word.Range> = {
    text: selectedText,
    load: jest.fn(),
    insertText: jest.fn().mockReturnValue({ select: jest.fn(), font: {} }),
    insertHtml: jest.fn().mockReturnValue({ select: jest.fn(), font: {} }),
    select: jest.fn(),
    font: {
      name: formatting?.fontFamily || 'Calibri',
      size: formatting?.fontSize || 11,
      color: formatting?.fontColor || '#000000',
      bold: formatting?.bold || false,
      italic: formatting?.italic || false,
      underline: formatting?.underline || 'None',
      highlightColor: formatting?.highlightColor || null,
      strikeThrough: formatting?.strikeThrough || false,
      subscript: formatting?.subscript || false,
      superscript: formatting?.superscript || false,
      load: jest.fn(),
    } as Word.Font,
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

describe('replaceSelectedText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic text replacement', () => {
    it('should replace selected text with new text', async () => {
      const originalText = 'original text';
      const newText = 'new text';
      const mockContext = createMockContext(originalText);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText(newText);

      expect(result.success).toBe(true);
      expect(result.originalText).toBe(originalText);
      expect(result.newText).toBe(newText);
      expect(result.originalLength).toBe(originalText.length);
      expect(result.newLength).toBe(newText.length);
    });

    it('should return location information', async () => {
      const mockContext = createMockContext('test', 'MainDoc');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text');

      expect(result.location).toBeDefined();
      expect(result.location.type).toBe('body');
    });

    it('should include timestamp', async () => {
      const mockContext = createMockContext('test');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const before = Date.now();
      const result = await replaceSelectedText('new text');
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Formatting preservation', () => {
    it('should preserve formatting when preserveFormatting is true', async () => {
      const formatting: Partial<TextFormatting> = {
        fontFamily: 'Arial',
        fontSize: 14,
        bold: true,
        italic: true,
        fontColor: '#FF0000',
      };
      const mockContext = createMockContext('test', 'MainDoc', formatting);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text', {
        preserveFormatting: true,
      });

      expect(result.success).toBe(true);
      expect(result.preservedFormatting).toBeDefined();
      expect(result.preservedFormatting?.fontFamily).toBe('Arial');
      expect(result.preservedFormatting?.fontSize).toBe(14);
      expect(result.preservedFormatting?.bold).toBe(true);
    });

    it('should not preserve formatting when preserveFormatting is false', async () => {
      const mockContext = createMockContext('test');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text', {
        preserveFormatting: false,
      });

      expect(result.success).toBe(true);
      expect(result.preservedFormatting).toBeUndefined();
    });
  });

  describe('HTML replacement', () => {
    it('should use insertHtml when useHtml is true', async () => {
      const mockContext = createMockContext('test');
      const mockRange = mockContext.document.getSelection();

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const html = '<strong>Bold text</strong>';
      await replaceSelectedText(html, { useHtml: true });

      expect(mockRange.insertHtml).toHaveBeenCalledWith(html, 'Replace');
      expect(mockRange.insertText).not.toHaveBeenCalled();
    });

    it('should use insertText when useHtml is false', async () => {
      const mockContext = createMockContext('test');
      const mockRange = mockContext.document.getSelection();

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const text = 'Plain text';
      await replaceSelectedText(text, { useHtml: false });

      expect(mockRange.insertText).toHaveBeenCalledWith(text, 'Replace');
      expect(mockRange.insertHtml).not.toHaveBeenCalled();
    });
  });

  describe('Selection after replacement', () => {
    it('should select new text when selectAfterReplace is true', async () => {
      const mockContext = createMockContext('test');
      const mockNewRange = { select: jest.fn(), font: {} };
      const mockRange = mockContext.document.getSelection();
      (mockRange.insertText as jest.Mock).mockReturnValue(mockNewRange);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      await replaceSelectedText('new text', { selectAfterReplace: true });

      expect(mockNewRange.select).toHaveBeenCalled();
    });

    it('should not select new text when selectAfterReplace is false', async () => {
      const mockContext = createMockContext('test');
      const mockNewRange = { select: jest.fn(), font: {} };
      const mockRange = mockContext.document.getSelection();
      (mockRange.insertText as jest.Mock).mockReturnValue(mockNewRange);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      await replaceSelectedText('new text', { selectAfterReplace: false });

      expect(mockNewRange.select).not.toHaveBeenCalled();
    });
  });

  describe('Document location detection', () => {
    const locationTests = [
      { bodyType: 'MainDoc', expected: 'body' },
      { bodyType: 'Document', expected: 'body' },
      { bodyType: 'Header', expected: 'header' },
      { bodyType: 'Footer', expected: 'footer' },
      { bodyType: 'TextBox', expected: 'textBox' },
      { bodyType: 'Table', expected: 'table' },
      { bodyType: 'Unknown', expected: 'unknown' },
    ];

    locationTests.forEach(({ bodyType, expected }) => {
      it(`should detect location as ${expected} for bodyType ${bodyType}`, async () => {
        const mockContext = createMockContext('test', bodyType);

        (Word.run as jest.Mock).mockImplementation(async (callback) => {
          return await callback(mockContext);
        });

        const result = await replaceSelectedText('new text');

        expect(result.location.type).toBe(expected);
      });
    });
  });

  describe('Error handling', () => {
    it('should return error result on Word API error', async () => {
      (Word.run as jest.Mock).mockImplementation(async () => {
        throw new Error('Word API error');
      });

      const result = await replaceSelectedText('new text');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Word API error');
      expect(result.errorCode).toBe(ReplacementErrorCode.INSERTION_ERROR);
    });

    it('should handle validation failure', async () => {
      const mockContext = createMockContext('');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text', {
        validateSelection: true,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(ReplacementErrorCode.EMPTY_SELECTION);
    });

    it('should include error message in result', async () => {
      (Word.run as jest.Mock).mockRejectedValue(new Error('Test error'));

      const result = await replaceSelectedText('new text');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });
  });

  describe('Options handling', () => {
    it('should use default options when none provided', async () => {
      const mockContext = createMockContext('test');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text');

      // Default options: preserveFormatting=true, validateSelection=true
      expect(result.success).toBe(true);
      expect(result.preservedFormatting).toBeDefined();
    });

    it('should merge provided options with defaults', async () => {
      const mockContext = createMockContext('test');

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await replaceSelectedText('new text', {
        useHtml: true,
        // Other options should use defaults
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('validateSelectionForReplacement', () => {
  it('should return valid for non-empty selection', async () => {
    const mockContext = createMockContext('selected text');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    // Mock getSelectionMetadata
    const textSelectionModule = require('../textSelection');
    jest.spyOn(textSelectionModule, 'getSelectionMetadata').mockResolvedValue({
      text: 'selected text',
      isEmpty: false,
      isValid: true,
      location: 'body',
      characterCount: 13,
      paragraphCount: 1,
    });

    const validation = await validateSelectionForReplacement();

    expect(validation.valid).toBe(true);
    expect(validation.selectionInfo).toBeDefined();
    expect(validation.selectionInfo?.isEmpty).toBe(false);
  });

  it('should return invalid for empty selection', async () => {
    const textSelectionModule = require('../textSelection');
    jest.spyOn(textSelectionModule, 'getSelectionMetadata').mockResolvedValue({
      text: '',
      isEmpty: true,
      isValid: false,
      location: 'body',
      characterCount: 0,
      paragraphCount: 0,
      error: 'No text selected',
    });

    const validation = await validateSelectionForReplacement();

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('No text selected');
    expect(validation.errorCode).toBe(ReplacementErrorCode.EMPTY_SELECTION);
  });

  it('should handle validation errors', async () => {
    const textSelectionModule = require('../textSelection');
    jest
      .spyOn(textSelectionModule, 'getSelectionMetadata')
      .mockRejectedValue(new Error('Validation error'));

    const validation = await validateSelectionForReplacement();

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Validation failed');
    expect(validation.errorCode).toBe(ReplacementErrorCode.CONTEXT_ERROR);
  });
});

describe('getSelectionFormatting', () => {
  it('should return formatting from selection', async () => {
    const formatting: Partial<TextFormatting> = {
      fontFamily: 'Times New Roman',
      fontSize: 12,
      bold: true,
      italic: false,
      fontColor: '#0000FF',
    };
    const mockContext = createMockContext('test', 'MainDoc', formatting);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getSelectionFormatting();

    expect(result).toBeDefined();
    expect(result?.fontFamily).toBe('Times New Roman');
    expect(result?.fontSize).toBe(12);
    expect(result?.bold).toBe(true);
  });

  it('should return undefined on error', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Formatting error'));

    const result = await getSelectionFormatting();

    expect(result).toBeUndefined();
  });
});

describe('replaceWithFormatting', () => {
  it('should replace text and apply custom formatting', async () => {
    const mockContext = createMockContext('test');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    // Mock validateSelectionForReplacement
    const textReplacementModule = require('../textReplacement');
    jest.spyOn(textReplacementModule, 'validateSelectionForReplacement').mockResolvedValue({
      valid: true,
      selectionInfo: {
        hasSelection: true,
        isEmpty: false,
        location: 'body',
        characterCount: 4,
      },
    });

    const customFormatting: TextFormatting = {
      bold: true,
      fontColor: '#FF0000',
      fontSize: 16,
    };

    const result = await replaceWithFormatting('formatted text', customFormatting);

    expect(result.success).toBe(true);
    expect(result.preservedFormatting).toEqual(customFormatting);
  });
});

describe('replaceWithHtml', () => {
  it('should replace text with HTML content', async () => {
    const mockContext = createMockContext('test');
    const mockRange = mockContext.document.getSelection();

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const html = '<p><strong>Bold</strong> and <em>italic</em></p>';
    await replaceWithHtml(html);

    expect(mockRange.insertHtml).toHaveBeenCalledWith(html, 'Replace');
  });
});

describe('Integration scenarios', () => {
  it('should handle long text replacement', async () => {
    const longText = 'A'.repeat(10000);
    const mockContext = createMockContext('short');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await replaceSelectedText(longText);

    expect(result.success).toBe(true);
    expect(result.newLength).toBe(10000);
  });

  it('should handle special characters', async () => {
    const specialText = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`\n\t';
    const mockContext = createMockContext('test');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await replaceSelectedText(specialText);

    expect(result.success).toBe(true);
    expect(result.newText).toBe(specialText);
  });

  it('should handle empty replacement text', async () => {
    const mockContext = createMockContext('delete me');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await replaceSelectedText('');

    expect(result.success).toBe(true);
    expect(result.newLength).toBe(0);
  });

  it('should handle Unicode characters', async () => {
    const unicodeText = '你好世界 🌍 Привет мир';
    const mockContext = createMockContext('test');

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await replaceSelectedText(unicodeText);

    expect(result.success).toBe(true);
    expect(result.newText).toBe(unicodeText);
  });
});
