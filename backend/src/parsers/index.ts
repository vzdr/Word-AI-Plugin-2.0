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
