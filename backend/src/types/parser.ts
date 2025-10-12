/**
 * Parser Types for Word AI Plugin Backend
 *
 * Defines types and interfaces for the file parsing system
 */

/**
 * Supported file types for parsing
 */
export enum FileType {
  PDF = 'PDF',
  DOCX = 'DOCX',
  TXT = 'TXT',
  MD = 'MD',
  CSV = 'CSV',
}

/**
 * Options for configuring parser behavior
 */
export interface ParserOptions {
  /**
   * Maximum file size to parse in bytes (default: 10MB)
   */
  maxFileSizeBytes?: number;

  /**
   * Whether to enable text chunking for large documents
   */
  enableChunking?: boolean;

  /**
   * Chunk size in characters (used if enableChunking is true)
   */
  chunkSize?: number;

  /**
   * Overlap between chunks in characters (used if enableChunking is true)
   */
  chunkOverlap?: number;

  /**
   * Whether to extract metadata from the file
   */
  extractMetadata?: boolean;

  /**
   * Custom encoding for text files (default: 'utf-8')
   */
  encoding?: string;

  /**
   * CSV-specific options
   */
  csvOptions?: {
    delimiter?: string;
    hasHeader?: boolean;
    skipEmptyLines?: boolean;
  };

  /**
   * Whether to preserve formatting (for formats that support it)
   */
  preserveFormatting?: boolean;
}

/**
 * Metadata extracted from parsed files
 */
export interface FileMetadata {
  /**
   * Original filename
   */
  fileName: string;

  /**
   * File type
   */
  fileType: FileType;

  /**
   * File size in bytes
   */
  fileSizeBytes: number;

  /**
   * MIME type of the file
   */
  mimeType: string;

  /**
   * Timestamp when the file was parsed
   */
  parsedAt: Date;

  /**
   * Number of pages (for PDF/DOCX)
   */
  pageCount?: number;

  /**
   * Author information (if available)
   */
  author?: string;

  /**
   * Document title (if available)
   */
  title?: string;

  /**
   * Creation date (if available)
   */
  createdAt?: Date;

  /**
   * Modified date (if available)
   */
  modifiedAt?: Date;

  /**
   * Additional format-specific metadata
   */
  custom?: Record<string, any>;
}

/**
 * Text chunk with metadata
 */
export interface TextChunk {
  /**
   * The text content of this chunk
   */
  text: string;

  /**
   * Zero-based index of this chunk
   */
  index: number;

  /**
   * Start position in the original text
   */
  startOffset: number;

  /**
   * End position in the original text
   */
  endOffset: number;

  /**
   * Length of this chunk in characters
   */
  length: number;

  /**
   * Whether this is the first chunk
   */
  isFirst: boolean;

  /**
   * Whether this is the last chunk
   */
  isLast: boolean;
}

/**
 * Parsed content from a file
 */
export interface ParsedContent {
  /**
   * The full text content extracted from the file
   */
  text: string;

  /**
   * File metadata
   */
  metadata: FileMetadata;

  /**
   * Text chunks (if chunking was enabled)
   */
  chunks?: TextChunk[];

  /**
   * Structured data (for CSV files)
   */
  structuredData?: Array<Record<string, any>>;

  /**
   * Any warnings encountered during parsing
   */
  warnings?: string[];
}

/**
 * Result of a parsing operation
 */
export type ParserResult = ParsedContent;

/**
 * Abstract parser interface that all parsers must implement
 */
export interface IParser {
  /**
   * Parse a file buffer
   */
  parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParserResult>;

  /**
   * Check if this parser supports the given file type
   */
  supports(fileType: FileType): boolean;

  /**
   * Validate file before parsing
   */
  validate(buffer: Buffer, options?: ParserOptions): Promise<void>;
}

/**
 * File type detection result
 */
export interface FileTypeDetectionResult {
  /**
   * Detected file type
   */
  fileType: FileType | null;

  /**
   * MIME type
   */
  mimeType: string;

  /**
   * Confidence level (0-1)
   */
  confidence: number;

  /**
   * Extension used for detection
   */
  extension?: string;
}
