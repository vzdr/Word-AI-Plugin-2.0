/**
 * Markdown Parser
 *
 * Handles Markdown files (.md) with structure preservation and chunking support
 */

import { BaseParser } from './base';
import { FileType, ParserOptions, ParserResult } from '../types/parser';
import { chunkText } from '../utils/textChunker';

/**
 * MarkdownParser - Parses Markdown files
 *
 * Features:
 * - Preserves markdown structure in metadata
 * - Extracts headers, lists, code blocks
 * - Text chunking for large files
 * - Handles various markdown flavors
 */
export class MarkdownParser extends BaseParser {
  constructor() {
    super([FileType.MD]);
  }

  /**
   * Parse a Markdown file buffer
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

      // Convert buffer to string (Markdown is always text-based)
      const text = this.bufferToString(buffer, opts.encoding);

      // Clean and normalize text (but preserve markdown formatting)
      const cleanedText = opts.preserveFormatting
        ? this.cleanTextPreserveMarkdown(text)
        : this.cleanText(text);

      // Extract markdown structure
      const structure = this.extractMarkdownStructure(cleanedText);

      // Create base metadata
      const metadata = this.createBaseMetadata(
        fileName,
        FileType.MD,
        buffer,
        detection.mimeType
      );

      // Add markdown-specific metadata
      metadata.custom = {
        encoding: opts.encoding,
        structure,
        title: this.extractTitle(cleanedText),
        headingCount: structure.headings.length,
        codeBlockCount: structure.codeBlocks.length,
        linkCount: structure.links.length,
        imageCount: structure.images.length,
        listCount: structure.lists.length,
      };

      // If a title was found in metadata, use it
      if (metadata.custom.title) {
        metadata.title = metadata.custom.title;
      }

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
      throw this.wrapError(error, 'MarkdownParser.parse');
    }
  }

  /**
   * Clean text while preserving markdown structure
   */
  private cleanTextPreserveMarkdown(text: string): string {
    return text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Preserve markdown spacing (don't reduce multiple newlines)
      .trim();
  }

  /**
   * Extract markdown structure elements
   */
  private extractMarkdownStructure(text: string): {
    headings: Array<{ level: number; text: string; line: number }>;
    codeBlocks: Array<{ language?: string; line: number }>;
    links: Array<{ text: string; url: string }>;
    images: Array<{ alt: string; url: string }>;
    lists: Array<{ type: 'ordered' | 'unordered'; line: number }>;
  } {
    const lines = text.split('\n');
    const structure = {
      headings: [] as Array<{ level: number; text: string; line: number }>,
      codeBlocks: [] as Array<{ language?: string; line: number }>,
      links: [] as Array<{ text: string; url: string }>,
      images: [] as Array<{ alt: string; url: string }>,
      lists: [] as Array<{ type: 'ordered' | 'unordered'; line: number }>,
    };

    let inCodeBlock = false;
    let codeBlockLanguage: string | undefined;

    lines.forEach((line, index) => {
      // Extract headings (# Header)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        structure.headings.push({
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
          line: index + 1,
        });
      }

      // Extract code blocks (```)
      const codeBlockMatch = line.match(/^```(\w+)?/);
      if (codeBlockMatch) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLanguage = codeBlockMatch[1];
          structure.codeBlocks.push({
            language: codeBlockLanguage,
            line: index + 1,
          });
        } else {
          inCodeBlock = false;
          codeBlockLanguage = undefined;
        }
      }

      // Extract links [text](url)
      const linkMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
      for (const match of linkMatches) {
        structure.links.push({
          text: match[1],
          url: match[2],
        });
      }

      // Extract images ![alt](url)
      const imageMatches = line.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g);
      for (const match of imageMatches) {
        structure.images.push({
          alt: match[1],
          url: match[2],
        });
      }

      // Extract lists
      if (line.match(/^\s*[-*+]\s+/)) {
        structure.lists.push({
          type: 'unordered',
          line: index + 1,
        });
      } else if (line.match(/^\s*\d+\.\s+/)) {
        structure.lists.push({
          type: 'ordered',
          line: index + 1,
        });
      }
    });

    return structure;
  }

  /**
   * Extract title from markdown content
   * Uses first H1 heading or filename
   */
  private extractTitle(text: string): string | undefined {
    // Look for first H1 heading
    const lines = text.split('\n');
    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) {
        return h1Match[1].trim();
      }
    }

    return undefined;
  }
}
