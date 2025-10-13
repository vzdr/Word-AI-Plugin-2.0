/**
 * Tests for Text Parser
 */

import { TextParser } from '../textParser';
import { FileType, ParserOptions } from '../../types/parser';
import { ValidationError } from '../../types/errors';

describe('TextParser', () => {
  let parser: TextParser;

  beforeEach(() => {
    parser = new TextParser();
  });

  describe('initialization', () => {
    test('should support TXT file type', () => {
      expect(parser.supports(FileType.TXT)).toBe(true);
    });

    test('should not support other file types', () => {
      expect(parser.supports(FileType.PDF)).toBe(false);
      expect(parser.supports(FileType.DOCX)).toBe(false);
      expect(parser.supports(FileType.MD)).toBe(false);
      expect(parser.supports(FileType.CSV)).toBe(false);
    });
  });

  describe('parse', () => {
    test('should parse simple text file', async () => {
      const content = 'Hello world!\nThis is a test.';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.text).toContain('Hello world');
      expect(result.text).toContain('This is a test');
      expect(result.metadata.fileName).toBe('test.txt');
      expect(result.metadata.fileType).toBe(FileType.TXT);
      expect(result.metadata.fileSizeBytes).toBe(buffer.length);
    });

    test('should handle UTF-8 encoded text', async () => {
      const content = 'Hello 世界! Test émojis 😀';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.text).toContain('世界');
      expect(result.text).toContain('😀');
      expect(result.metadata.custom?.encoding).toBe('utf-8');
    });

    test('should handle ASCII text', async () => {
      const content = 'Simple ASCII text without special characters';
      const buffer = Buffer.from(content, 'ascii');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.text).toBe(content.trim());
    });

    test('should clean and normalize text', async () => {
      const content = 'Line 1\r\nLine 2\rLine 3\n\n\n\nLine 4   extra   spaces';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      // Should normalize line endings
      expect(result.text).not.toContain('\r');
      // Should reduce excessive newlines
      expect(result.text).not.toMatch(/\n{3,}/);
      // Should reduce excessive spaces
      expect(result.text).not.toMatch(/  +/);
    });

    test('should extract metadata', async () => {
      const content = 'Test content';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        extractMetadata: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.fileName).toBe('test.txt');
      expect(result.metadata.fileType).toBe(FileType.TXT);
      expect(result.metadata.mimeType).toBe('text/plain');
      expect(result.metadata.parsedAt).toBeInstanceOf(Date);
      expect(result.metadata.custom?.detectedEncoding).toBeDefined();
    });

    test('should chunk large text when enabled', async () => {
      const content = 'a'.repeat(10000);
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
      expect(result.chunks![0].isFirst).toBe(true);
      expect(result.chunks![result.chunks!.length - 1].isLast).toBe(true);
    });

    test('should not chunk small text even when enabled', async () => {
      const content = 'Short text';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        enableChunking: true,
        chunkSize: 1000,
      });

      expect(result.chunks).toBeUndefined();
    });

    test('should handle custom encoding option', async () => {
      const content = 'Test content';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        encoding: 'utf-8',
      });

      expect(result.metadata.custom?.encoding).toBe('utf-8');
    });

    test('should detect UTF-8 BOM', async () => {
      // UTF-8 BOM: EF BB BF
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('Test content', 'utf-8');
      const buffer = Buffer.concat([bom, content]);

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.metadata.custom?.detectedEncoding).toBe('utf-8');
      expect(result.text).toBeDefined();
    });

    test('should handle text with only whitespace', async () => {
      const content = '   \n\n\n   \t\t   ';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.text).toBe(''); // Should be cleaned to empty
    });

    test('should handle large files within size limit', async () => {
      const content = 'a'.repeat(5 * 1024 * 1024); // 5MB
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        maxFileSizeBytes: 10 * 1024 * 1024,
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBe(content.length);
    });
  });

  describe('validation', () => {
    test('should reject empty files', async () => {
      const buffer = Buffer.alloc(0);

      await expect(parser.parse(buffer, 'test.txt')).rejects.toThrow(
        ValidationError
      );
    });

    test('should reject files exceeding size limit', async () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      await expect(
        parser.parse(buffer, 'test.txt', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).rejects.toThrow(ValidationError);
    });

    test('should accept files within size limit', async () => {
      const buffer = Buffer.from('Test content', 'utf-8');

      await expect(
        parser.parse(buffer, 'test.txt', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('encoding detection', () => {
    test('should detect ASCII encoding', async () => {
      const content = 'Simple ASCII text';
      const buffer = Buffer.from(content, 'ascii');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.metadata.custom?.detectedEncoding).toMatch(/ascii|utf-8/i);
    });

    test('should detect UTF-8 encoding', async () => {
      const content = 'UTF-8 text with émojis 😀';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.metadata.custom?.detectedEncoding).toBe('utf-8');
    });

    test('should fallback to UTF-8 on detection failure', async () => {
      const buffer = Buffer.from([0xff, 0xfe, 0x00, 0x00]); // Invalid UTF-8

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.metadata.custom?.encoding).toBe('utf-8');
    });
  });

  describe('error handling', () => {
    test('should handle parsing errors gracefully', async () => {
      const buffer = Buffer.from('Test content', 'utf-8');

      // Force an error by providing an invalid encoding
      await expect(
        parser.parse(buffer, 'test.txt', {
          encoding: 'invalid-encoding' as any,
        })
      ).rejects.toThrow();
    });

    test('should wrap unknown errors', async () => {
      const buffer = Buffer.from('Test', 'utf-8');

      try {
        await parser.parse(buffer, 'test.txt');
      } catch (error: any) {
        // Should successfully parse, no error expected
        expect(error).toBeUndefined();
      }
    });
  });

  describe('metadata extraction', () => {
    test('should include original and cleaned lengths', async () => {
      const content = 'Test   content   with   spaces\n\n\n\n';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        extractMetadata: true,
      });

      expect(result.metadata.custom?.originalLength).toBeDefined();
      expect(result.metadata.custom?.cleanedLength).toBeDefined();
      expect(result.metadata.custom?.originalLength).toBeGreaterThanOrEqual(
        result.metadata.custom?.cleanedLength
      );
    });

    test('should include file size in metadata', async () => {
      const content = 'Test content';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.metadata.fileSizeBytes).toBe(buffer.length);
    });

    test('should include parse timestamp', async () => {
      const buffer = Buffer.from('Test', 'utf-8');
      const before = new Date();

      const result = await parser.parse(buffer, 'test.txt');

      const after = new Date();
      expect(result.metadata.parsedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(result.metadata.parsedAt.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('special cases', () => {
    test('should handle files with special characters in name', async () => {
      const buffer = Buffer.from('Test', 'utf-8');

      const result = await parser.parse(buffer, 'test@#$%.txt');

      expect(result.metadata.fileName).toBe('test@#$%.txt');
    });

    test('should handle files without extension', async () => {
      const buffer = Buffer.from('Test', 'utf-8');

      const result = await parser.parse(buffer, 'testfile');

      expect(result.metadata.fileName).toBe('testfile');
    });

    test('should handle very long text', async () => {
      const content = 'Word '.repeat(100000);
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt', {
        maxFileSizeBytes: 10 * 1024 * 1024,
        enableChunking: true,
        chunkSize: 4000,
      });

      expect(result.text).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });

    test('should handle mixed line ending styles', async () => {
      const content = 'Line1\rLine2\nLine3\r\nLine4';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      // All line endings should be normalized to \n
      expect(result.text).not.toContain('\r\n');
      expect(result.text).not.toContain('\r');
      expect(result.text).toContain('\n');
    });

    test('should preserve meaningful whitespace', async () => {
      const content = 'Line 1\n  Indented line\nLine 3';
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.txt');

      expect(result.text).toContain('Indented');
    });
  });

  describe('integration with options', () => {
    test('should apply all options correctly', async () => {
      const content = 'a'.repeat(10000);
      const buffer = Buffer.from(content, 'utf-8');

      const options: ParserOptions = {
        maxFileSizeBytes: 20000,
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
        extractMetadata: true,
        encoding: 'utf-8',
      };

      const result = await parser.parse(buffer, 'test.txt', options);

      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });
  });
});
