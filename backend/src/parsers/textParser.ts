/**
 * Text Parser
 *
 * Handles plain text files (.txt) with encoding detection and chunking support
 */

import { BaseParser } from './base';
import { FileType, ParserOptions, ParserResult } from '../types/parser';
import { chunkText } from '../utils/textChunker';

/**
 * TextParser - Parses plain text files
 *
 * Features:
 * - Supports UTF-8, ASCII, and other common encodings
 * - Automatic encoding detection
 * - Text chunking for large files
 * - Basic text cleaning and normalization
 */
export class TextParser extends BaseParser {
  constructor() {
    super([FileType.TXT]);
  }

  /**
   * Parse a plain text file buffer
   */
  async parse(
    buffer: Buffer,
    fileName: string,
    options?: ParserOptions
  ): Promise<ParserResult> {
    try {
      // Validate input
      await this.validate(buffer, options);

      // Merge options with defaults
      const opts = this.mergeOptions(options);

      // Detect file type and ensure it's supported
      const detection = this.detectFileType(buffer, fileName);
      if (detection.fileType) {
        this.ensureSupported(detection.fileType);
      }

      // Detect encoding and convert buffer to string
      const encoding = this.detectEncoding(buffer);
      const actualEncoding = opts.encoding || encoding;

      // Convert buffer to string
      let text: string;
      try {
        text = this.bufferToString(buffer, actualEncoding);
      } catch (error) {
        // Fallback to UTF-8 if specified encoding fails
        const warnings: string[] = [];
        if (actualEncoding !== 'utf-8') {
          warnings.push(`Failed to decode with ${actualEncoding}, falling back to UTF-8`);
          text = this.bufferToString(buffer, 'utf-8');
        } else {
          throw error;
        }
      }

      // Clean and normalize text
      const cleanedText = this.cleanText(text);

      // Create base metadata
      const metadata = this.createBaseMetadata(
        fileName,
        FileType.TXT,
        buffer,
        detection.mimeType
      );

      // Add encoding info to custom metadata
      metadata.custom = {
        encoding: actualEncoding,
        detectedEncoding: encoding,
        originalLength: text.length,
        cleanedLength: cleanedText.length,
      };

      // Prepare result
      const result: ParserResult = {
        text: cleanedText,
        metadata,
      };

      // Chunk text if enabled
      if (opts.enableChunking && cleanedText.length > opts.chunkSize) {
        result.chunks = chunkText(cleanedText, {
          chunkSize: opts.chunkSize,
          overlap: opts.chunkOverlap,
        });
      }

      return result;
    } catch (error) {
      throw this.wrapError(error, 'TextParser.parse');
    }
  }

  /**
   * Detect text encoding from buffer
   * Returns best guess encoding (utf-8, ascii, etc.)
   */
  private detectEncoding(buffer: Buffer): string {
    // Check for BOM (Byte Order Mark)
    if (buffer.length >= 3) {
      // UTF-8 BOM: EF BB BF
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf-8';
      }
    }

    if (buffer.length >= 2) {
      // UTF-16 BE BOM: FE FF
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16be';
      }
      // UTF-16 LE BOM: FF FE
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf-16le';
      }
    }

    // Check if content is valid UTF-8
    if (this.isValidUtf8(buffer)) {
      return 'utf-8';
    }

    // Check if ASCII (all bytes < 128)
    if (this.isAscii(buffer)) {
      return 'ascii';
    }

    // Default to UTF-8
    return 'utf-8';
  }

  /**
   * Check if buffer contains valid UTF-8
   */
  private isValidUtf8(buffer: Buffer): boolean {
    try {
      const decoded = buffer.toString('utf-8');
      // Check for replacement characters which indicate invalid UTF-8
      // This is a simple heuristic
      const replacementCharCount = (decoded.match(/\uFFFD/g) || []).length;
      // If more than 5% are replacement chars, probably not UTF-8
      return replacementCharCount < decoded.length * 0.05;
    } catch {
      return false;
    }
  }

  /**
   * Check if buffer contains only ASCII characters
   */
  private isAscii(buffer: Buffer): boolean {
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > 127) {
        return false;
      }
    }
    return true;
  }
}
