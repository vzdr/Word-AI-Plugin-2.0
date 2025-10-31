/**
 * PDF Parser
 *
 * Parses PDF files and extracts text content and metadata
 */

import pdfParse from 'pdf-parse';
import { BaseParser } from './base';
import {
  FileType,
  ParserOptions,
  ParserResult,
  FileMetadata,
} from '../types/parser';
import {
  FileCorruptedError,
  PasswordProtectedError,
  ExtractionError,
} from '../types/errors';
import { chunkText } from '../utils/textChunker';

/**
 * Parser for PDF files
 */
export class PdfParser extends BaseParser {
  constructor() {
    super([FileType.PDF]);
  }

  /**
   * Parse a PDF file buffer
   */
  async parse(
    buffer: Buffer,
    fileName: string,
    options?: ParserOptions
  ): Promise<ParserResult> {
    try {
      // Validate the file
      await this.validate(buffer, options);

      // Detect file type
      const detection = this.detectFileType(buffer, fileName);
      if (detection.fileType !== FileType.PDF) {
        this.ensureSupported(detection.fileType!);
      }

      // Merge options with defaults
      const opts = this.mergeOptions(options);

      // Parse PDF
      let pdfData: any;
      try {
        pdfData = await pdfParse(buffer);
      } catch (error) {
        // Check for password protection
        if (
          error instanceof Error &&
          (error.message.includes('password') ||
            error.message.includes('encrypted') ||
            error.message.includes('Encrypted'))
        ) {
          throw new PasswordProtectedError('PDF file is password protected', {
            fileName,
            fileSize: buffer.length,
          });
        }

        // Check for corruption
        if (
          error instanceof Error &&
          (error.message.includes('Invalid PDF') ||
            error.message.includes('corrupt') ||
            error.message.includes('damaged'))
        ) {
          throw new FileCorruptedError('PDF file is corrupted or invalid', {
            fileName,
            fileSize: buffer.length,
            error: error.message,
          });
        }

        // Generic extraction error
        throw new ExtractionError(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`, {
          fileName,
          fileSize: buffer.length,
        });
      }

      // Extract and clean text
      const rawText = pdfData.text || '';
      const cleanedText = this.cleanText(rawText);

      if (!cleanedText) {
        throw new ExtractionError('No text content could be extracted from PDF', {
          fileName,
          pageCount: pdfData.numpages,
        });
      }

      // Create base metadata
      const metadata: FileMetadata = this.createBaseMetadata(
        fileName,
        FileType.PDF,
        buffer,
        detection.mimeType
      );

      // Extract PDF-specific metadata
      if (opts.extractMetadata && pdfData.info) {
        metadata.pageCount = pdfData.numpages;

        if (pdfData.info.Author) {
          metadata.author = String(pdfData.info.Author);
        }

        if (pdfData.info.Title) {
          metadata.title = String(pdfData.info.Title);
        }

        if (pdfData.info.CreationDate) {
          try {
            metadata.createdAt = this.parsePdfDate(String(pdfData.info.CreationDate));
          } catch (e) {
            // Ignore date parsing errors
          }
        }

        if (pdfData.info.ModDate) {
          try {
            metadata.modifiedAt = this.parsePdfDate(String(pdfData.info.ModDate));
          } catch (e) {
            // Ignore date parsing errors
          }
        }

        // Store additional metadata in custom field
        metadata.custom = {
          producer: pdfData.info.Producer ? String(pdfData.info.Producer) : undefined,
          creator: pdfData.info.Creator ? String(pdfData.info.Creator) : undefined,
          subject: pdfData.info.Subject ? String(pdfData.info.Subject) : undefined,
          keywords: pdfData.info.Keywords ? String(pdfData.info.Keywords) : undefined,
          pdfVersion: pdfData.version || undefined,
        };
      } else {
        metadata.pageCount = pdfData.numpages;
      }

      // Create result
      const result: ParserResult = {
        text: cleanedText,
        metadata,
      };

      // Chunk text if enabled
      if (opts.enableChunking) {
        result.chunks = chunkText(cleanedText, {
          chunkSize: opts.chunkSize,
          overlap: opts.chunkOverlap,
        });
      }

      return result;
    } catch (error) {
      // Re-throw known errors
      if (
        error instanceof PasswordProtectedError ||
        error instanceof FileCorruptedError ||
        error instanceof ExtractionError
      ) {
        throw error;
      }

      // Wrap unknown errors
      throw this.wrapError(error, 'PDF parsing failed');
    }
  }

  /**
   * Parse PDF date format (D:YYYYMMDDHHmmSS)
   */
  private parsePdfDate(dateString: string): Date {
    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    // Example: D:20230101120000+01'00'

    // Remove D: prefix if present
    let cleanDate = dateString.replace(/^D:/, '');

    // Extract date components
    const year = cleanDate.substring(0, 4);
    const month = cleanDate.substring(4, 6);
    const day = cleanDate.substring(6, 8);
    const hour = cleanDate.substring(8, 10) || '00';
    const minute = cleanDate.substring(10, 12) || '00';
    const second = cleanDate.substring(12, 14) || '00';

    // Create ISO date string
    const isoDate = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    const date = new Date(isoDate);

    if (isNaN(date.getTime())) {
      throw new Error('Invalid PDF date format');
    }

    return date;
  }
}
