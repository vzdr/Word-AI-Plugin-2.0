/**
 * CSV Parser
 *
 * Handles CSV files with flexible delimiter support and structured data extraction
 */

import { BaseParser } from './base';
import { FileType, ParserOptions, ParserResult } from '../types/parser';
import { chunkText } from '../utils/textChunker';

/**
 * CsvParser - Parses CSV files into structured data
 *
 * Features:
 * - Supports multiple delimiters (comma, semicolon, tab)
 * - Handles headers and headerless CSVs
 * - Automatic delimiter detection
 * - Structured data extraction
 * - Flattened text representation with chunking
 */
export class CsvParser extends BaseParser {
  constructor() {
    super([FileType.CSV]);
  }

  /**
   * Parse a CSV file buffer
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

      // Convert buffer to string
      const text = this.bufferToString(buffer, opts.encoding);

      // Detect or use specified delimiter
      const delimiter = opts.csvOptions.delimiter || this.detectDelimiter(text);
      const hasHeader = opts.csvOptions.hasHeader;
      const skipEmptyLines = opts.csvOptions.skipEmptyLines;

      // Parse CSV into structured data
      const { data, headers, rowCount, columnCount } = this.parseCSV(
        text,
        delimiter,
        hasHeader,
        skipEmptyLines
      );

      // Create flattened text representation
      const flattenedText = this.flattenCSVToText(data, headers);

      // Create base metadata
      const metadata = this.createBaseMetadata(
        fileName,
        FileType.CSV,
        buffer,
        detection.mimeType
      );

      // Add CSV-specific metadata
      metadata.custom = {
        encoding: opts.encoding,
        delimiter,
        hasHeader,
        rowCount,
        columnCount,
        headers: headers || [],
      };

      // Prepare result
      const result: ParserResult = {
        text: flattenedText,
        metadata,
        structuredData: data,
      };

      // Chunk the flattened text if enabled
      if (opts.enableChunking && flattenedText.length > opts.chunkSize) {
        result.chunks = chunkText(flattenedText, {
          chunkSize: opts.chunkSize,
          overlap: opts.chunkOverlap,
        });
      }

      return result;
    } catch (error) {
      throw this.wrapError(error, 'CsvParser.parse');
    }
  }

  /**
   * Detect the delimiter used in the CSV
   */
  private detectDelimiter(text: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const firstLine = text.split('\n')[0];

    if (!firstLine) {
      return ','; // Default to comma
    }

    // Count occurrences of each delimiter
    const counts = delimiters.map((delimiter) => ({
      delimiter,
      count: (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length,
    }));

    // Return delimiter with highest count
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].delimiter : ',';
  }

  /**
   * Parse CSV text into structured data
   */
  private parseCSV(
    text: string,
    delimiter: string,
    hasHeader: boolean,
    skipEmptyLines: boolean
  ): {
    data: Array<Record<string, any>>;
    headers: string[] | null;
    rowCount: number;
    columnCount: number;
  } {
    const lines = text.split('\n').map((line) => line.trim());
    const rows: string[][] = [];

    // Parse each line
    for (const line of lines) {
      if (skipEmptyLines && !line) {
        continue;
      }

      if (line) {
        const row = this.parseCsvLine(line, delimiter);
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return { data: [], headers: null, rowCount: 0, columnCount: 0 };
    }

    // Extract headers if present
    let headers: string[] | null = null;
    let dataRows = rows;

    if (hasHeader && rows.length > 0) {
      headers = rows[0];
      dataRows = rows.slice(1);
    }

    // Convert to structured data
    const data: Array<Record<string, any>> = [];
    const columnCount = Math.max(...rows.map((row) => row.length));

    for (const row of dataRows) {
      const rowData: Record<string, any> = {};

      if (headers) {
        // Use headers as keys
        headers.forEach((header, index) => {
          const value = row[index] || '';
          rowData[header] = this.parseValue(value);
        });
      } else {
        // Use column indices as keys
        row.forEach((value, index) => {
          rowData[`column_${index}`] = this.parseValue(value);
        });
      }

      data.push(rowData);
    }

    return {
      data,
      headers,
      rowCount: dataRows.length,
      columnCount,
    };
  }

  /**
   * Parse a single CSV line respecting quotes
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    result.push(current.trim());

    return result;
  }

  /**
   * Parse a value to appropriate type
   */
  private parseValue(value: string): any {
    // Remove surrounding quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    // Empty value
    if (value === '') {
      return null;
    }

    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
      return num;
    }

    // String
    return value;
  }

  /**
   * Flatten CSV data to text representation
   */
  private flattenCSVToText(
    data: Array<Record<string, any>>,
    headers: string[] | null
  ): string {
    const lines: string[] = [];

    if (data.length === 0) {
      return '';
    }

    // Add header line
    if (headers) {
      lines.push(headers.join(' | '));
      lines.push(headers.map(() => '---').join(' | '));
    }

    // Add data rows
    for (const row of data) {
      const values = headers
        ? headers.map((header) => this.formatValue(row[header]))
        : Object.values(row).map((value) => this.formatValue(value));

      lines.push(values.join(' | '));
    }

    return lines.join('\n');
  }

  /**
   * Format a value for text display
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }
}
