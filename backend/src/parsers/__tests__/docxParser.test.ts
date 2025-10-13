/**
 * Tests for DOCX Parser
 */

import { DocxParser } from '../docxParser';
import { FileType, ParserOptions } from '../../types/parser';
import { ValidationError, FileCorruptedError } from '../../types/errors';

// Mock mammoth module
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockImplementation((options: any) => {
    const buffer = options.buffer;
    const content = buffer.toString('utf-8');

    // Simulate corrupted DOCX
    if (content.includes('CORRUPTED_DOCX')) {
      throw new Error('Invalid or corrupted DOCX file');
    }

    // Simulate normal DOCX
    return Promise.resolve({
      value: 'This is extracted DOCX text.\nIt has multiple paragraphs.\nWith some formatting.',
      messages: [
        { type: 'info', message: 'Document contains 3 paragraphs' },
        { type: 'warning', message: 'Some styles were not recognized' },
      ],
    });
  }),
}));

// Mock JSZip module
jest.mock('jszip', () => {
  return jest.fn().mockImplementation(() => {
    return {
      loadAsync: jest.fn().mockResolvedValue({
        file: jest.fn((path: string) => {
          if (path === 'docProps/core.xml') {
            return {
              async: jest.fn().mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:title>Test DOCX Document</dc:title>
  <dc:subject>Test Subject</dc:subject>
  <dc:creator>Test Author</dc:creator>
  <dc:description>Test description of the document</dc:description>
  <dc:keywords>test, docx, document</dc:keywords>
  <cp:category>Test Category</cp:category>
  <cp:lastModifiedBy>Last Editor</cp:lastModifiedBy>
  <cp:revision>3</cp:revision>
  <dcterms:created>2023-12-01T12:00:00Z</dcterms:created>
  <dcterms:modified>2023-12-15T15:00:00Z</dcterms:modified>
</cp:coreProperties>`),
            };
          }
          return null;
        }),
      }),
    };
  });
});

describe('DocxParser', () => {
  let parser: DocxParser;

  beforeEach(() => {
    parser = new DocxParser();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should support DOCX file type', () => {
      expect(parser.supports(FileType.DOCX)).toBe(true);
    });

    test('should not support other file types', () => {
      expect(parser.supports(FileType.PDF)).toBe(false);
      expect(parser.supports(FileType.TXT)).toBe(false);
      expect(parser.supports(FileType.MD)).toBe(false);
      expect(parser.supports(FileType.CSV)).toBe(false);
    });
  });

  describe('parse', () => {
    test('should parse valid DOCX file', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx');

      expect(result.text).toContain('extracted DOCX text');
      expect(result.metadata.fileName).toBe('test.docx');
      expect(result.metadata.fileType).toBe(FileType.DOCX);
      expect(result.metadata.fileSizeBytes).toBe(buffer.length);
    });

    test('should extract DOCX metadata from core.xml', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBe('Test DOCX Document');
      expect(result.metadata.author).toBe('Test Author');
      expect(result.metadata.subject).toBe('Test Subject');
      expect(result.metadata.description).toBe('Test description of the document');
      expect(result.metadata.custom?.keywords).toBe('test, docx, document');
      expect(result.metadata.custom?.category).toBe('Test Category');
      expect(result.metadata.custom?.lastModifiedBy).toBe('Last Editor');
      expect(result.metadata.custom?.revision).toBe('3');
    });

    test('should parse created and modified dates', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx', {
        extractMetadata: true,
      });

      expect(result.metadata.createdAt).toBeInstanceOf(Date);
      expect(result.metadata.modifiedAt).toBeInstanceOf(Date);
      expect(result.metadata.createdAt?.getFullYear()).toBe(2023);
      expect(result.metadata.modifiedAt?.getFullYear()).toBe(2023);
      expect(result.metadata.createdAt?.getMonth()).toBe(11); // December
    });

    test('should detect corrupted DOCX files', async () => {
      const buffer = Buffer.from('CORRUPTED_DOCX', 'utf-8');

      await expect(parser.parse(buffer, 'corrupted.docx')).rejects.toThrow(
        FileCorruptedError
      );
    });

    test('should collect warnings from mammoth', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx');

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings).toContain('Some styles were not recognized');
    });

    test('should chunk large DOCX text when enabled', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx', {
        enableChunking: true,
        chunkSize: 30,
        chunkOverlap: 10,
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
      expect(result.chunks![0].isFirst).toBe(true);
      expect(result.chunks![result.chunks!.length - 1].isLast).toBe(true);
    });

    test('should not chunk when disabled', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx', {
        enableChunking: false,
      });

      expect(result.chunks).toBeUndefined();
    });

    test('should handle DOCX without metadata', async () => {
      const JSZip = require('jszip');
      JSZip.mockImplementationOnce(() => ({
        loadAsync: jest.fn().mockResolvedValue({
          file: jest.fn(() => null), // No core.xml found
        }),
      }));

      const buffer = Buffer.from('MINIMAL_DOCX', 'utf-8');
      const result = await parser.parse(buffer, 'minimal.docx');

      expect(result.text).toBeDefined();
      expect(result.metadata.fileName).toBe('minimal.docx');
    });

    test('should clean and normalize extracted text', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx');

      // Text should be cleaned
      expect(result.text).not.toMatch(/  +/);
      expect(result.text).not.toMatch(/\n{3,}/);
    });
  });

  describe('validation', () => {
    test('should reject empty files', async () => {
      const buffer = Buffer.alloc(0);

      await expect(parser.parse(buffer, 'test.docx')).rejects.toThrow(
        ValidationError
      );
    });

    test('should reject files exceeding size limit', async () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      await expect(
        parser.parse(buffer, 'test.docx', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).rejects.toThrow(ValidationError);
    });

    test('should accept files within size limit', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      await expect(
        parser.parse(buffer, 'test.docx', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('metadata extraction', () => {
    test('should extract all available metadata fields', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx', {
        extractMetadata: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.fileName).toBe('test.docx');
      expect(result.metadata.fileType).toBe(FileType.DOCX);
      expect(result.metadata.mimeType).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(result.metadata.parsedAt).toBeInstanceOf(Date);
      expect(result.metadata.title).toBeDefined();
      expect(result.metadata.author).toBeDefined();
    });

    test('should handle partial metadata in XML', async () => {
      const JSZip = require('jszip');
      JSZip.mockImplementationOnce(() => ({
        loadAsync: jest.fn().mockResolvedValue({
          file: jest.fn(() => ({
            async: jest.fn().mockResolvedValue(`<?xml version="1.0"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>Only Title</dc:title>
</cp:coreProperties>`),
          })),
        }),
      }));

      const buffer = Buffer.from('PARTIAL_METADATA_DOCX', 'utf-8');
      const result = await parser.parse(buffer, 'test.docx', {
        extractMetadata: true,
      });

      expect(result.metadata.title).toBe('Only Title');
      expect(result.metadata.author).toBeUndefined();
    });

    test('should include parse timestamp', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');
      const before = new Date();

      const result = await parser.parse(buffer, 'test.docx');

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
    test('should wrap mammoth errors appropriately', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockImplementationOnce(() => {
        throw new Error('Unknown DOCX error');
      });

      const buffer = Buffer.from('INVALID_DOCX', 'utf-8');

      await expect(parser.parse(buffer, 'test.docx')).rejects.toThrow();
    });

    test('should handle corruption errors specifically', async () => {
      const buffer = Buffer.from('CORRUPTED_DOCX', 'utf-8');

      await expect(parser.parse(buffer, 'corrupted.docx')).rejects.toThrow(
        FileCorruptedError
      );

      try {
        await parser.parse(buffer, 'corrupted.docx');
      } catch (error: any) {
        expect(error.message).toContain('corrupted');
      }
    });

    test('should handle XML parsing errors gracefully', async () => {
      const JSZip = require('jszip');
      JSZip.mockImplementationOnce(() => ({
        loadAsync: jest.fn().mockResolvedValue({
          file: jest.fn(() => ({
            async: jest.fn().mockResolvedValue('INVALID XML <><'),
          })),
        }),
      }));

      const buffer = Buffer.from('DOCX_WITH_BAD_XML', 'utf-8');

      // Should not throw, just skip metadata extraction
      const result = await parser.parse(buffer, 'test.docx', {
        extractMetadata: true,
      });

      expect(result.text).toBeDefined();
    });
  });

  describe('integration with options', () => {
    test('should apply all options correctly', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const options: ParserOptions = {
        maxFileSizeBytes: 20 * 1024 * 1024,
        enableChunking: true,
        chunkSize: 30,
        chunkOverlap: 10,
        extractMetadata: true,
      };

      const result = await parser.parse(buffer, 'test.docx', options);

      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.metadata.title).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    test('should work with minimal options', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test.docx');

      expect(result.text).toBeDefined();
      expect(result.metadata.fileName).toBe('test.docx');
    });
  });

  describe('special cases', () => {
    test('should handle DOCX with special characters in filename', async () => {
      const buffer = Buffer.from('VALID_DOCX_CONTENT', 'utf-8');

      const result = await parser.parse(buffer, 'test@#$%.docx');

      expect(result.metadata.fileName).toBe('test@#$%.docx');
    });

    test('should handle DOCX with Unicode text', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockImplementationOnce(() =>
        Promise.resolve({
          value: 'Unicode text: 世界 émojis 😀',
          messages: [],
        })
      );

      const buffer = Buffer.from('UNICODE_DOCX', 'utf-8');
      const result = await parser.parse(buffer, 'unicode.docx');

      expect(result.text).toContain('世界');
      expect(result.text).toContain('😀');
    });

    test('should handle empty warnings array', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockImplementationOnce(() =>
        Promise.resolve({
          value: 'Clean document',
          messages: [],
        })
      );

      const buffer = Buffer.from('CLEAN_DOCX', 'utf-8');
      const result = await parser.parse(buffer, 'clean.docx');

      expect(result.warnings).toBeUndefined();
    });

    test('should filter info messages and only include warnings/errors', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockImplementationOnce(() =>
        Promise.resolve({
          value: 'Document text',
          messages: [
            { type: 'info', message: 'Info message' },
            { type: 'warning', message: 'Warning message' },
            { type: 'error', message: 'Error message' },
          ],
        })
      );

      const buffer = Buffer.from('MESSAGES_DOCX', 'utf-8');
      const result = await parser.parse(buffer, 'messages.docx');

      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBe(2); // Only warning and error
      expect(result.warnings).toContain('Warning message');
      expect(result.warnings).toContain('Error message');
      expect(result.warnings).not.toContain('Info message');
    });
  });
});
