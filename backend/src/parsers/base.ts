/**
 * Base Parser Abstract Class
 *
 * Provides common functionality for all file parsers
 */

import {
  FileType,
  FileMetadata,
  ParserOptions,
  ParserResult,
  IParser,
  FileTypeDetectionResult,
} from '../types/parser';
import {
  ParserError,
  UnsupportedFileTypeError,
  ValidationError,
  ErrorCode,
} from '../types/errors';

/**
 * Default parser options
 */
export const DEFAULT_PARSER_OPTIONS: Required<Omit<ParserOptions, 'csvOptions'>> & {
  csvOptions: Required<ParserOptions['csvOptions']>;
} = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  enableChunking: false,
  chunkSize: 4000,
  chunkOverlap: 200,
  extractMetadata: true,
  encoding: 'utf-8',
  preserveFormatting: false,
  csvOptions: {
    delimiter: ',',
    hasHeader: true,
    skipEmptyLines: true,
  },
};

/**
 * Abstract base class for all parsers
 */
export abstract class BaseParser implements IParser {
  protected readonly supportedTypes: FileType[];

  constructor(supportedTypes: FileType[]) {
    this.supportedTypes = supportedTypes;
  }

  /**
   * Parse a file buffer - must be implemented by subclasses
   */
  abstract parse(
    buffer: Buffer,
    fileName: string,
    options?: ParserOptions
  ): Promise<ParserResult>;

  /**
   * Check if this parser supports the given file type
   */
  supports(fileType: FileType): boolean {
    return this.supportedTypes.includes(fileType);
  }

  /**
   * Validate file before parsing
   */
  async validate(buffer: Buffer, options?: ParserOptions): Promise<void> {
    const opts = this.mergeOptions(options);

    // Validate file size
    if (buffer.length > opts.maxFileSizeBytes) {
      throw new ValidationError(
        `File size (${buffer.length} bytes) exceeds maximum allowed size (${opts.maxFileSizeBytes} bytes)`,
        {
          actualSize: buffer.length,
          maxSize: opts.maxFileSizeBytes,
        }
      );
    }

    // Validate buffer is not empty
    if (buffer.length === 0) {
      throw new ValidationError('File is empty', {
        fileSize: 0,
      });
    }
  }

  /**
   * Detect file type from buffer and filename
   */
  protected detectFileType(buffer: Buffer, fileName: string): FileTypeDetectionResult {
    const extension = this.getFileExtension(fileName);
    let fileType: FileType | null = null;
    let mimeType = 'application/octet-stream';
    let confidence = 0.5;

    // Detect by extension
    switch (extension.toLowerCase()) {
      case 'pdf':
        fileType = FileType.PDF;
        mimeType = 'application/pdf';
        confidence = 0.8;
        break;
      case 'docx':
        fileType = FileType.DOCX;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        confidence = 0.8;
        break;
      case 'txt':
        fileType = FileType.TXT;
        mimeType = 'text/plain';
        confidence = 0.8;
        break;
      case 'md':
        fileType = FileType.MD;
        mimeType = 'text/markdown';
        confidence = 0.8;
        break;
      case 'csv':
        fileType = FileType.CSV;
        mimeType = 'text/csv';
        confidence = 0.8;
        break;
    }

    // Verify by magic numbers (first few bytes)
    if (buffer.length >= 4) {
      const header = buffer.slice(0, 4).toString('hex');

      // PDF signature: %PDF
      if (buffer.slice(0, 4).toString() === '%PDF') {
        fileType = FileType.PDF;
        mimeType = 'application/pdf';
        confidence = 1.0;
      }
      // DOCX signature: PK (ZIP format)
      else if (header.startsWith('504b0304') || header.startsWith('504b0506')) {
        if (extension.toLowerCase() === 'docx') {
          fileType = FileType.DOCX;
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          confidence = 1.0;
        }
      }
    }

    return {
      fileType,
      mimeType,
      confidence,
      extension: extension || undefined,
    };
  }

  /**
   * Get file extension from filename
   */
  protected getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * Create base metadata object
   */
  protected createBaseMetadata(
    fileName: string,
    fileType: FileType,
    buffer: Buffer,
    mimeType: string
  ): FileMetadata {
    return {
      fileName,
      fileType,
      fileSizeBytes: buffer.length,
      mimeType,
      parsedAt: new Date(),
    };
  }

  /**
   * Merge user options with defaults
   */
  protected mergeOptions(options?: ParserOptions): Required<ParserOptions> {
    return {
      ...DEFAULT_PARSER_OPTIONS,
      ...options,
      csvOptions: {
        ...DEFAULT_PARSER_OPTIONS.csvOptions,
        ...options?.csvOptions,
      },
    };
  }

  /**
   * Wrap parsing errors with context
   */
  protected wrapError(error: unknown, context: string): ParserError {
    if (error instanceof ParserError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ParserError(`${context}: ${message}`, ErrorCode.PARSER_ERROR, {
      originalError: message,
      context,
    });
  }

  /**
   * Check if file type is supported, throw if not
   */
  protected ensureSupported(fileType: FileType): void {
    if (!this.supports(fileType)) {
      throw new UnsupportedFileTypeError(fileType, {
        supportedTypes: this.supportedTypes,
      });
    }
  }

  /**
   * Safely convert buffer to string with encoding
   */
  protected bufferToString(buffer: Buffer, encoding: string = 'utf-8'): string {
    try {
      return buffer.toString(encoding as BufferEncoding);
    } catch (error) {
      throw new ParserError(
        `Failed to decode buffer with encoding: ${encoding}`,
        ErrorCode.PARSER_ERROR,
        {
          encoding,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Clean and normalize text
   */
  protected cleanText(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Remove excessive newlines (more than 2)
      .replace(/\n{3,}/g, '\n\n')
      // Trim
      .trim();
  }
}
