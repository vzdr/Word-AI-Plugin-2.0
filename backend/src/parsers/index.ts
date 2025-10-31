/**
 * Parser Module Exports
 *
 * Central export point for all parser types, classes, and utilities
 */

// Export types
export {
  FileType,
  ParserOptions,
  FileMetadata,
  TextChunk,
  ParsedContent,
  ParserResult,
  IParser,
  FileTypeDetectionResult,
} from '../types/parser';

// Export base parser
export { BaseParser, DEFAULT_PARSER_OPTIONS } from './base';

// Export error types
export {
  ParserError,
  UnsupportedFileTypeError,
  FileCorruptedError,
  PasswordProtectedError,
  ParserTimeoutError,
  ExtractionError,
} from '../types/errors';

// Export text chunking utilities
export {
  chunkText,
  calculateChunkCount,
  getOptimalChunkSize,
  mergeSmallChunks,
  rechunkText,
} from '../utils/textChunker';

export type { ChunkOptions } from '../utils/textChunker';

// Parser implementations
export { PdfParser } from './pdfParser';
export { DocxParser } from './docxParser';
export { TextParser } from './textParser';
export { MarkdownParser } from './markdownParser';
export { CsvParser } from './csvParser';

// Import parser implementations for factory
import { PdfParser } from './pdfParser';
import { DocxParser } from './docxParser';
import { TextParser } from './textParser';
import { MarkdownParser } from './markdownParser';
import { CsvParser } from './csvParser';
import { FileType, ParserResult, ParserOptions } from '../types/parser';
import { UnsupportedFileTypeError } from '../types/errors';

/**
 * Factory function to parse a file with the appropriate parser
 * @param buffer File buffer
 * @param fileName File name (used for type detection)
 * @param mimeType MIME type (optional, used for type detection)
 * @param options Parser options
 * @returns Parser result
 */
export async function parseFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
  options?: ParserOptions
): Promise<ParserResult> {
  // Detect file type from extension
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  let parser;

  switch (extension) {
    case 'pdf':
      parser = new PdfParser();
      break;
    case 'docx':
      parser = new DocxParser();
      break;
    case 'txt':
      parser = new TextParser();
      break;
    case 'md':
    case 'markdown':
      parser = new MarkdownParser();
      break;
    case 'csv':
      parser = new CsvParser();
      break;
    default:
      // Try to detect from MIME type
      if (mimeType) {
        if (mimeType === 'application/pdf') {
          parser = new PdfParser();
        } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          parser = new DocxParser();
        } else if (mimeType === 'text/plain') {
          parser = new TextParser();
        } else if (mimeType === 'text/markdown') {
          parser = new MarkdownParser();
        } else if (mimeType === 'text/csv') {
          parser = new CsvParser();
        }
      }

      if (!parser) {
        throw new UnsupportedFileTypeError(extension as FileType, {
          fileName,
          mimeType,
        });
      }
  }

  return parser.parse(buffer, fileName, options);
}
