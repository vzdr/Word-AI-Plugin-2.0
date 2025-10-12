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

// Specific parser exports will be added by other streams:
// - Stream B will add: export { PDFParser } from './pdfParser';
// - Stream B will add: export { DOCXParser } from './docxParser';
// - Stream C will add: export { TextParser } from './textParser';
// - Stream C will add: export { MarkdownParser } from './markdownParser';
// - Stream C will add: export { CSVParser } from './csvParser';
