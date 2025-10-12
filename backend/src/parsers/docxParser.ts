/**
 * DOCX Parser
 *
 * Parses DOCX files and extracts text content and metadata
 */

import * as mammoth from 'mammoth';
import { BaseParser } from './base';
import {
  FileType,
  ParserOptions,
  ParserResult,
  FileMetadata,
} from '../types/parser';
import {
  FileCorruptedError,
  ExtractionError,
} from '../types/errors';
import { chunkText } from '../utils/textChunker';

/**
 * Parser for DOCX files
 */
export class DocxParser extends BaseParser {
  constructor() {
    super([FileType.DOCX]);
  }

  /**
   * Parse a DOCX file buffer
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
      if (detection.fileType !== FileType.DOCX) {
        this.ensureSupported(detection.fileType!);
      }

      // Merge options with defaults
      const opts = this.mergeOptions(options);

      // Parse DOCX
      let extractionResult: mammoth.Result<string>;
      try {
        extractionResult = await mammoth.extractRawText({ buffer });
      } catch (error) {
        // Check for corruption
        if (
          error instanceof Error &&
          (error.message.includes('corrupt') ||
            error.message.includes('invalid') ||
            error.message.includes('damaged') ||
            error.message.includes('not a valid'))
        ) {
          throw new FileCorruptedError('DOCX file is corrupted or invalid', {
            fileName,
            fileSize: buffer.length,
            error: error.message,
          });
        }

        // Generic extraction error
        throw new ExtractionError(
          `Failed to parse DOCX: ${error instanceof Error ? error.message : String(error)}`,
          {
            fileName,
            fileSize: buffer.length,
          }
        );
      }

      // Extract and clean text
      const rawText = extractionResult.value || '';
      const cleanedText = this.cleanText(rawText);

      if (!cleanedText) {
        throw new ExtractionError('No text content could be extracted from DOCX', {
          fileName,
        });
      }

      // Create base metadata
      const metadata: FileMetadata = this.createBaseMetadata(
        fileName,
        FileType.DOCX,
        buffer,
        detection.mimeType
      );

      // Extract DOCX-specific metadata
      if (opts.extractMetadata) {
        try {
          const docxMetadata = await this.extractDocxMetadata(buffer);

          if (docxMetadata.author) {
            metadata.author = docxMetadata.author;
          }

          if (docxMetadata.title) {
            metadata.title = docxMetadata.title;
          }

          if (docxMetadata.created) {
            metadata.createdAt = docxMetadata.created;
          }

          if (docxMetadata.modified) {
            metadata.modifiedAt = docxMetadata.modified;
          }

          // Store additional metadata in custom field
          metadata.custom = {
            subject: docxMetadata.subject,
            keywords: docxMetadata.keywords,
            description: docxMetadata.description,
            category: docxMetadata.category,
            lastModifiedBy: docxMetadata.lastModifiedBy,
            revision: docxMetadata.revision,
          };
        } catch (e) {
          // Metadata extraction is optional, continue if it fails
          // Add warning to result if available
        }
      }

      // Collect warnings from mammoth
      const warnings: string[] = [];
      if (extractionResult.messages && extractionResult.messages.length > 0) {
        extractionResult.messages.forEach((msg) => {
          if (msg.type === 'warning') {
            warnings.push(msg.message);
          }
        });
      }

      // Create result
      const result: ParserResult = {
        text: cleanedText,
        metadata,
        warnings: warnings.length > 0 ? warnings : undefined,
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
        error instanceof FileCorruptedError ||
        error instanceof ExtractionError
      ) {
        throw error;
      }

      // Wrap unknown errors
      throw this.wrapError(error, 'DOCX parsing failed');
    }
  }

  /**
   * Extract metadata from DOCX file
   */
  private async extractDocxMetadata(buffer: Buffer): Promise<{
    author?: string;
    title?: string;
    subject?: string;
    keywords?: string;
    description?: string;
    category?: string;
    created?: Date;
    modified?: Date;
    lastModifiedBy?: string;
    revision?: string;
  }> {
    const JSZip = require('jszip');
    const metadata: any = {};

    try {
      // DOCX is a ZIP file, extract core.xml for metadata
      const zip = await JSZip.loadAsync(buffer);
      const corePropsFile = zip.file('docProps/core.xml');

      if (corePropsFile) {
        const corePropsXml = await corePropsFile.async('text');

        // Parse XML metadata (simple extraction)
        metadata.title = this.extractXmlValue(corePropsXml, 'dc:title');
        metadata.subject = this.extractXmlValue(corePropsXml, 'dc:subject');
        metadata.author = this.extractXmlValue(corePropsXml, 'dc:creator');
        metadata.keywords = this.extractXmlValue(corePropsXml, 'cp:keywords');
        metadata.description = this.extractXmlValue(corePropsXml, 'dc:description');
        metadata.category = this.extractXmlValue(corePropsXml, 'cp:category');
        metadata.lastModifiedBy = this.extractXmlValue(corePropsXml, 'cp:lastModifiedBy');
        metadata.revision = this.extractXmlValue(corePropsXml, 'cp:revision');

        const createdStr = this.extractXmlValue(corePropsXml, 'dcterms:created');
        if (createdStr) {
          try {
            metadata.created = new Date(createdStr);
          } catch (e) {
            // Ignore date parsing errors
          }
        }

        const modifiedStr = this.extractXmlValue(corePropsXml, 'dcterms:modified');
        if (modifiedStr) {
          try {
            metadata.modified = new Date(modifiedStr);
          } catch (e) {
            // Ignore date parsing errors
          }
        }
      }
    } catch (e) {
      // Metadata extraction is optional, return what we have
    }

    return metadata;
  }

  /**
   * Extract value from XML string
   */
  private extractXmlValue(xml: string, tagName: string): string | undefined {
    // Handle both self-closing and regular tags
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)<\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }
}
