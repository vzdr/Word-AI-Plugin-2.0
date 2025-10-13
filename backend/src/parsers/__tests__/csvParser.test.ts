/**
 * Tests for CSV Parser
 */

import { CsvParser } from '../csvParser';
import { FileType, ParserOptions } from '../../types/parser';
import { ValidationError } from '../../types/errors';

describe('CsvParser', () => {
  let parser: CsvParser;

  beforeEach(() => {
    parser = new CsvParser();
  });

  describe('initialization', () => {
    test('should support CSV file type', () => {
      expect(parser.supports(FileType.CSV)).toBe(true);
    });

    test('should not support other file types', () => {
      expect(parser.supports(FileType.PDF)).toBe(false);
      expect(parser.supports(FileType.DOCX)).toBe(false);
      expect(parser.supports(FileType.TXT)).toBe(false);
      expect(parser.supports(FileType.MD)).toBe(false);
    });
  });

  describe('parse', () => {
    test('should parse simple CSV with headers', async () => {
      const content = `Name,Age,City
John,30,New York
Jane,25,Boston`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toBeDefined();
      expect(result.structuredData).toHaveLength(2);
      expect(result.structuredData![0].Name).toBe('John');
      expect(result.structuredData![0].Age).toBe(30);
      expect(result.metadata.custom?.rowCount).toBe(2);
    });

    test('should parse CSV without headers', async () => {
      const content = `John,30,New York
Jane,25,Boston`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: false },
      });

      expect(result.structuredData).toBeDefined();
      expect(result.structuredData).toHaveLength(2);
      expect(result.structuredData![0].column_0).toBe('John');
      expect(result.structuredData![0].column_1).toBe(30);
    });

    test('should detect comma delimiter', async () => {
      const content = `Name,Age,City
John,30,New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      expect(result.metadata.custom?.delimiter).toBe(',');
    });

    test('should detect semicolon delimiter', async () => {
      const content = `Name;Age;City
John;30;New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      expect(result.metadata.custom?.delimiter).toBe(';');
    });

    test('should detect tab delimiter', async () => {
      const content = `Name\tAge\tCity
John\t30\tNew York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      expect(result.metadata.custom?.delimiter).toBe('\t');
    });

    test('should detect pipe delimiter', async () => {
      const content = `Name|Age|City
John|30|New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      expect(result.metadata.custom?.delimiter).toBe('|');
    });

    test('should handle quoted fields', async () => {
      const content = `Name,Description
"John Doe","A person with a, comma"
"Jane","Normal field"`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Name).toBe('John Doe');
      expect(result.structuredData![0].Description).toBe('A person with a, comma');
    });

    test('should handle escaped quotes', async () => {
      const content = `Name,Quote
"John","He said ""Hello"""
"Jane","Simple"`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Quote).toBe('He said "Hello"');
    });

    test('should parse numeric values', async () => {
      const content = `Name,Age,Score
John,30,95.5
Jane,25,87.3`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Age).toBe(30);
      expect(result.structuredData![0].Score).toBe(95.5);
      expect(typeof result.structuredData![0].Age).toBe('number');
      expect(typeof result.structuredData![0].Score).toBe('number');
    });

    test('should parse boolean values', async () => {
      const content = `Name,Active,Verified
John,true,false
Jane,TRUE,FALSE`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Active).toBe(true);
      expect(result.structuredData![0].Verified).toBe(false);
      expect(result.structuredData![1].Active).toBe(true);
    });

    test('should handle null/empty values', async () => {
      const content = `Name,Age,City
John,,New York
,25,Boston`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Age).toBeNull();
      expect(result.structuredData![1].Name).toBeNull();
    });

    test('should skip empty lines when enabled', async () => {
      const content = `Name,Age

John,30

Jane,25
`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true, skipEmptyLines: true },
      });

      expect(result.structuredData).toHaveLength(2);
    });

    test('should include empty lines when disabled', async () => {
      const content = `Name,Age

John,30`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true, skipEmptyLines: false },
      });

      expect(result.structuredData!.length).toBeGreaterThanOrEqual(1);
    });

    test('should generate flattened text representation', async () => {
      const content = `Name,Age,City
John,30,New York
Jane,25,Boston`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.text).toContain('Name');
      expect(result.text).toContain('John');
      expect(result.text).toContain('30');
      expect(result.text).toContain('|'); // Table format
    });

    test('should extract metadata', async () => {
      const content = `Name,Age,City
John,30,New York
Jane,25,Boston`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        extractMetadata: true,
        csvOptions: { hasHeader: true },
      });

      expect(result.metadata.custom?.rowCount).toBe(2);
      expect(result.metadata.custom?.columnCount).toBe(3);
      expect(result.metadata.custom?.headers).toEqual(['Name', 'Age', 'City']);
      expect(result.metadata.custom?.hasHeader).toBe(true);
    });

    test('should chunk large CSV when enabled', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `Row${i},${i},Value${i}`);
      const content = 'Name,Number,Value\n' + rows.join('\n');
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
        csvOptions: { hasHeader: true },
      });

      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });

    test('should handle special characters in data', async () => {
      const content = `Name,Description
"John","Test with émoji 😀"
"Jane","Special chars: @#$%"`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Description).toContain('😀');
      expect(result.structuredData![1].Description).toContain('@#$%');
    });

    test('should handle custom delimiter option', async () => {
      const content = `Name;Age;City
John;30;New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { delimiter: ';', hasHeader: true },
      });

      expect(result.structuredData![0].Name).toBe('John');
      expect(result.metadata.custom?.delimiter).toBe(';');
    });
  });

  describe('validation', () => {
    test('should reject empty files', async () => {
      const buffer = Buffer.alloc(0);

      await expect(parser.parse(buffer, 'test.csv')).rejects.toThrow(
        ValidationError
      );
    });

    test('should reject files exceeding size limit', async () => {
      const buffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      await expect(
        parser.parse(buffer, 'test.csv', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).rejects.toThrow(ValidationError);
    });

    test('should accept files within size limit', async () => {
      const buffer = Buffer.from('Name,Age\nJohn,30', 'utf-8');

      await expect(
        parser.parse(buffer, 'test.csv', {
          maxFileSizeBytes: 10 * 1024 * 1024,
        })
      ).resolves.toBeDefined();
    });
  });

  describe('edge cases', () => {
    test('should handle single column CSV', async () => {
      const content = `Name
John
Jane`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toHaveLength(2);
      expect(result.structuredData![0].Name).toBe('John');
    });

    test('should handle single row CSV', async () => {
      const content = `Name,Age,City`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toHaveLength(0);
      expect(result.metadata.custom?.headers).toEqual(['Name', 'Age', 'City']);
    });

    test('should handle inconsistent column counts', async () => {
      const content = `Name,Age,City
John,30,New York
Jane,25
Bob,40,LA,Extra`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toHaveLength(3);
      expect(result.structuredData![1].City).toBeNull();
    });

    test('should handle very long field values', async () => {
      const longValue = 'a'.repeat(10000);
      const content = `Name,Description
John,"${longValue}"`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Description).toBe(longValue);
    });

    test('should handle CSV with BOM', async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from('Name,Age\nJohn,30', 'utf-8');
      const buffer = Buffer.concat([bom, content]);

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toBeDefined();
    });

    test('should handle newlines within quoted fields', async () => {
      const content = `Name,Description
"John","Multi-line
description
here"
"Jane","Single line"`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Description).toContain('\n');
    });

    test('should handle leading/trailing whitespace', async () => {
      const content = `Name, Age , City
 John , 30 , New York `;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      // Whitespace should be trimmed
      expect(result.structuredData![0].Name).toBe('John');
      expect(result.structuredData![0].Age).toBe(30);
    });

    test('should handle all empty rows', async () => {
      const content = `Name,Age


`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true, skipEmptyLines: true },
      });

      expect(result.structuredData).toHaveLength(0);
    });

    test('should handle CSV with only headers', async () => {
      const content = `Name,Age,City`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData).toHaveLength(0);
      expect(result.metadata.custom?.headers).toHaveLength(3);
    });
  });

  describe('text flattening', () => {
    test('should create readable table format', async () => {
      const content = `Name,Age,City
John,30,New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.text).toContain('Name | Age | City');
      expect(result.text).toContain('---');
      expect(result.text).toContain('John | 30 | New York');
    });

    test('should handle null values in flattened text', async () => {
      const content = `Name,Age
John,
,25`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.text).toContain('John |  '); // Empty cell
    });
  });

  describe('delimiter detection', () => {
    test('should default to comma when no clear delimiter', async () => {
      const content = `NoDelimitersHere`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      expect(result.metadata.custom?.delimiter).toBe(',');
    });

    test('should choose most common delimiter', async () => {
      const content = `Name;Age,Extra;City
John;30,X;New York`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv');

      // Should detect semicolon as most common
      expect(result.metadata.custom?.delimiter).toBe(';');
    });
  });

  describe('integration with options', () => {
    test('should apply all options correctly', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => `Row${i},${i},Value${i}`);
      const content = 'Name,Number,Value\n' + rows.join('\n');
      const buffer = Buffer.from(content, 'utf-8');

      const options: ParserOptions = {
        maxFileSizeBytes: 100000,
        enableChunking: true,
        chunkSize: 1000,
        chunkOverlap: 100,
        extractMetadata: true,
        encoding: 'utf-8',
        csvOptions: {
          delimiter: ',',
          hasHeader: true,
          skipEmptyLines: true,
        },
      };

      const result = await parser.parse(buffer, 'test.csv', options);

      expect(result.text).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.structuredData).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(result.chunks!.length).toBeGreaterThan(1);
    });
  });

  describe('value parsing', () => {
    test('should preserve string values that look like numbers', async () => {
      const content = `Name,ID,Value
John,"00123",Real123`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].ID).toBe('00123'); // Quoted preserved as string
      expect(result.structuredData![0].Value).toBe('Real123'); // String with letters
    });

    test('should handle scientific notation', async () => {
      const content = `Name,Value
Test,1.5e10`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(typeof result.structuredData![0].Value).toBe('number');
      expect(result.structuredData![0].Value).toBe(1.5e10);
    });

    test('should handle negative numbers', async () => {
      const content = `Name,Balance
John,-100.50`;
      const buffer = Buffer.from(content, 'utf-8');

      const result = await parser.parse(buffer, 'test.csv', {
        csvOptions: { hasHeader: true },
      });

      expect(result.structuredData![0].Balance).toBe(-100.5);
    });
  });
});
