/**
 * Tests for PDF Parser
 */

import { PdfParser } from '../pdfParser';
import { FileType, ParserOptions } from '../../types/parser';
import {
  ValidationError,
  PasswordProtectedError,
  FileCorruptedError,
} from '../../types/errors';

// Mock pdf-parse module
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    const content = buffer.toString('utf-8');

    // Simulate password-protected PDF
    if (content.includes('ENCRYPTED_PDF')) {
      throw new Error('Password required or incorrect password');
    }

    // Simulate corrupted PDF
    if (content.includes('CORRUPTED_PDF')) {
      throw new Error('Invalid PDF structure');
    }

    // Simulate normal PDF
    return Promise.resolve({
      text: 'This is extracted PDF text.\nIt has multiple lines.\nAnd some content.',
      numpages: 3,
      info: {
        Title: 'Test PDF Document',
        Author: 'Test Author',
        Subject: 'Test Subject',
        Keywords: 'test, pdf, document',
        Creator: 'Test Creator',
        Producer: 'Test Producer',
        CreationDate: 'D:20231201120000',
        ModDate: 'D:20231215150000',
        PDFFormatVersion: '1.7',
      },
      metadata: null,
      version: '1.7',
    });
  });
});

describe('PdfParser', () => {
  let parser: PdfParser;

  beforeEach(() => {
    parser = new PdfParser();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should support PDF file type', () => {
      expect(parser.supports(FileType.PDF)).toBe(true);
    });

    test('should not support other file types', () => {
      expect(parser.supports(FileType.TXT)).toBe(false);
      expect(parser.supports(FileType.DOCX)).toBe(false);
      expect(parser.supports(FileType.MD)).toBe(false);
      expect(parser.supports(FileType.CSV)).toBe(false);
    });
  });

  describe('parse', () => {
    test('should parse valid PDF file', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf');

      expect(result.text).toContain('extracted PDF text');
      expect(result.metadata.fileName).toBe('test.pdf');
      expect(result.metadata.fileType).toBe(FileType.PDF);
      expect(result.metadata.fileSizeBytes).toBe(buffer.length);
      expect(result.metadata.pageCount).toBe(3);
    });

    test('should extract PDF metadata', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBe('Test PDF Document');
      expect(result.metadata.author).toBe('Test Author');
      expect(result.metadata.subject).toBe('Test Subject');
      expect(result.metadata.custom?.keywords).toBe('test, pdf, document');
      expect(result.metadata.custom?.creator).toBe('Test Creator');
      expect(result.metadata.custom?.producer).toBe('Test Producer');
      expect(result.metadata.custom?.pdfVersion).toBe('1.7');
    });

    test('should parse PDF dates correctly', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf', {
        extractMetadata: true,
      });

      expect(result.metadata.createdAt).toBeInstanceOf(Date);
      expect(result.metadata.modifiedAt).toBeInstanceOf(Date);
      expect(result.metadata.createdAt?.getFullYear()).toBe(2023);
      expect(result.metadata.createdAt?.getMonth()).toBe(11); // December (0-indexed)
    });

    test('should detect password-protected PDFs', async () => {
      const buffer = Buffer.from('ENCRYPTED_PDF', 'utf-8');

      await expect(parser.parse(buffer, 'encrypted.pdf')).rejects.toThrow(
        PasswordProtectedError
      );
    });

    test('should detect corrupted PDFs', async () => {
      const buffer = Buffer.from('CORRUPTED_PDF', 'utf-8');

      await expect(parser.parse(buffer, 'corrupted.pdf')).rejects.toThrow(
        FileCorruptedError
      );
    });

    test('should chunk large PDF text when enabled', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf', {
        enableChunking: true,
        chunkSize: 20,
        chunkOverlap: 5,
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
      expect(result.chunks![0].isFirst).toBe(true);
      expect(result.chunks![result.chunks!.length - 1].isLast).toBe(true);
    });

    test('should not chunk when disabled', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf', {
        enableChunking: false,
      });

      expect(result.chunks).toBeUndefined();
    });

    test('should handle PDF without metadata', async () => {
      // Mock PDF without metadata
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: 'PDF content without metadata',
          numpages: 1,
          info: {},
          metadata: null,
        })
      );

      const buffer = Buffer.from('MINIMAL_PDF', 'utf-8');
      const result = await parser.parse(buffer, 'minimal.pdf');

      expect(result.text).toBeDefined();
      expect(result.metadata.fileName).toBe('minimal.pdf');
      expect(result.metadata.pageCount).toBe(1);
    });

    test('should extract page count correctly', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf');

      expect(result.metadata.pageCount).toBe(3);
    });

    test('should clean and normalize extracted text', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf');

      // Text should be cleaned (excessive whitespace removed)
      expect(result.text).not.toMatch(/  +/);
      expect(result.text).not.toMatch(/\n{3,}/);
    });
  });

  describe('validation', () => {
    test('should reject empty files', async () => {
      const buffer = Buffer.alloc(0);

      await expect(parser.parse(buffer, 'test.pdf')).rejects.toThrow(
        ValidationError
      );
    });

    test('should reject files exceeding size limit', async () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      await expect(
        parser.parse(buffer, 'test.pdf', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).rejects.toThrow(ValidationError);
    });

    test('should accept files within size limit', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      await expect(
        parser.parse(buffer, 'test.pdf', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('metadata extraction', () => {
    test('should extract all available metadata fields', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf', {
        extractMetadata: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.fileName).toBe('test.pdf');
      expect(result.metadata.fileType).toBe(FileType.PDF);
      expect(result.metadata.mimeType).toBe('application/pdf');
      expect(result.metadata.parsedAt).toBeInstanceOf(Date);
      expect(result.metadata.pageCount).toBe(3);
      expect(result.metadata.title).toBeDefined();
      expect(result.metadata.author).toBeDefined();
    });

    test('should handle missing optional metadata fields', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: 'Test content',
          numpages: 1,
          info: {
            Title: 'Only Title',
          },
          metadata: null,
        })
      );

      const buffer = Buffer.from('PARTIAL_METADATA_PDF', 'utf-8');
      const result = await parser.parse(buffer, 'test.pdf', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBe('Only Title');
      expect(result.metadata.author).toBeUndefined();
    });

    test('should include parse timestamp', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');
      const before = new Date();

      const result = await parser.parse(buffer, 'test.pdf');

      const after = new Date();
      expect(result.metadata.parsedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(result.metadata.parsedAt.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('error handling', () => {
    test('should wrap pdf-parse errors appropriately', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() => {
        throw new Error('Unknown PDF error');
      });

      const buffer = Buffer.from('INVALID_PDF', 'utf-8');

      await expect(parser.parse(buffer, 'test.pdf')).rejects.toThrow();
    });

    test('should handle password errors specifically', async () => {
      const buffer = Buffer.from('ENCRYPTED_PDF', 'utf-8');

      await expect(parser.parse(buffer, 'encrypted.pdf')).rejects.toThrow(
        PasswordProtectedError
      );

      try {
        await parser.parse(buffer, 'encrypted.pdf');
      } catch (error: any) {
        expect(error.message).toContain('password');
      }
    });

    test('should handle corruption errors specifically', async () => {
      const buffer = Buffer.from('CORRUPTED_PDF', 'utf-8');

      await expect(parser.parse(buffer, 'corrupted.pdf')).rejects.toThrow(
        FileCorruptedError
      );
    });
  });

  describe('integration with options', () => {
    test('should apply all options correctly', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const options: ParserOptions = {
        maxFileSizeBytes: 20 * 1024 * 1024,
        enableChunking: true,
        chunkSize: 30,
        chunkOverlap: 10,
        extractMetadata: true,
      };

      const result = await parser.parse(buffer, 'test.pdf', options);

      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.metadata.title).toBeDefined();
    });

    test('should work with minimal options', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.pdf');

      expect(result.text).toBeDefined();
      expect(result.metadata.fileName).toBe('test.pdf');
    });
  });

  describe('special cases', () => {
    test('should handle multi-page PDFs', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'multi-page.pdf');

      expect(result.metadata.pageCount).toBeGreaterThan(1);
    });

    test('should handle PDFs with special characters in filename', async () => {
      const buffer = Buffer.from('VALID_PDF_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test@#$%.pdf');

      expect(result.metadata.fileName).toBe('test@#$%.pdf');
    });

    test('should handle PDFs with Unicode text', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockImplementationOnce(() =>
        Promise.resolve({
          text: 'Unicode text: 世界 émojis 😀',
          numpages: 1,
          info: {},
          metadata: null,
        })
      );

      const buffer = Buffer.from('UNICODE_PDF', 'utf-8');
      const result = await parser.parse(buffer, 'unicode.pdf');

      expect(result.text).toContain('世界');
      expect(result.text).toContain('😀');
    });
  });
});
