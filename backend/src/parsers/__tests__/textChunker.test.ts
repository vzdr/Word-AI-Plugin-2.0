/**
 * Tests for Text Chunking Utility
 */

import {
  chunkText,
  calculateChunkCount,
  getOptimalChunkSize,
  mergeSmallChunks,
  rechunkText,
  ChunkOptions,
} from '../../utils/textChunker';
import { TextChunk } from '../../types/parser';

describe('textChunker', () => {
  describe('chunkText', () => {
    test('should return empty array for empty text', () => {
      const result = chunkText('');
      expect(result).toEqual([]);
    });

    test('should return single chunk for text smaller than chunk size', () => {
      const text = 'Hello world';
      const result = chunkText(text, { chunkSize: 100 });

      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(text);
      expect(result[0].index).toBe(0);
      expect(result[0].startOffset).toBe(0);
      expect(result[0].endOffset).toBe(text.length);
      expect(result[0].isFirst).toBe(true);
      expect(result[0].isLast).toBe(true);
    });

    test('should split large text into multiple chunks', () => {
      const text = 'a'.repeat(1000);
      const result = chunkText(text, { chunkSize: 100, overlap: 10 });

      expect(result.length).toBeGreaterThan(1);
      expect(result[0].isFirst).toBe(true);
      expect(result[result.length - 1].isLast).toBe(true);
    });

    test('should apply overlap between chunks', () => {
      const text = 'Hello world. This is a test. Another sentence here.';
      const result = chunkText(text, { chunkSize: 30, overlap: 10 });

      expect(result.length).toBeGreaterThan(1);
      // Check that there's overlap by comparing end of one chunk with start of next
      if (result.length > 1) {
        const overlap1End = result[0].text.slice(-10);
        const overlap2Start = result[1].text.slice(0, 10);
        // Some overlap should exist (may not be exact due to boundary breaks)
        expect(result[1].startOffset).toBeLessThanOrEqual(result[0].endOffset);
      }
    });

    test('should break at sentence boundaries when enabled', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const result = chunkText(text, {
        chunkSize: 35,
        overlap: 5,
        breakAtSentences: true,
      });

      // Check that chunks tend to end after sentence endings
      result.slice(0, -1).forEach((chunk) => {
        const trimmed = chunk.text.trim();
        // Should likely end with sentence-ending punctuation
        if (trimmed.length > 0) {
          expect(/[.!?]$/.test(trimmed) || chunk.isLast).toBeTruthy();
        }
      });
    });

    test('should break at word boundaries when enabled', () => {
      const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10';
      const result = chunkText(text, {
        chunkSize: 25,
        overlap: 3,
        breakAtWords: true,
      });

      // Check that chunks don't break words
      result.forEach((chunk) => {
        const trimmed = chunk.text.trim();
        // First and last chars should not be in the middle of a word
        // (unless it's a very long word)
        if (trimmed.length > 0) {
          expect(trimmed).not.toMatch(/^\S*\s/);
        }
      });
    });

    test('should respect minChunkSize', () => {
      const text = 'a'.repeat(500);
      const result = chunkText(text, {
        chunkSize: 100,
        overlap: 10,
        minChunkSize: 50,
      });

      result.forEach((chunk) => {
        expect(chunk.length).toBeGreaterThanOrEqual(50);
      });
    });

    test('should handle text with multiple newlines', () => {
      const text = 'Line 1\n\nLine 2\n\n\nLine 3\n\nLine 4';
      const result = chunkText(text, { chunkSize: 20, overlap: 5 });

      expect(result.length).toBeGreaterThan(0);
      const reconstructed = result.map((c) => c.text).join('');
      // Should contain all the content
      expect(reconstructed).toContain('Line 1');
      expect(reconstructed).toContain('Line 4');
    });

    test('should maintain correct offsets', () => {
      const text = 'a'.repeat(1000);
      const result = chunkText(text, { chunkSize: 100, overlap: 10 });

      result.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
        expect(chunk.startOffset).toBeGreaterThanOrEqual(0);
        expect(chunk.endOffset).toBeLessThanOrEqual(text.length);
        expect(chunk.endOffset).toBeGreaterThan(chunk.startOffset);
        expect(chunk.length).toBe(chunk.endOffset - chunk.startOffset);
      });
    });

    test('should handle special characters', () => {
      const text = 'Hello 世界! Test émojis 😀 and symbols @#$%^&*()';
      const result = chunkText(text, { chunkSize: 20, overlap: 5 });

      expect(result.length).toBeGreaterThan(0);
      const reconstructed = result.map((c) => c.text).join('');
      expect(reconstructed).toContain('世界');
      expect(reconstructed).toContain('😀');
    });

    test('should handle custom chunk options', () => {
      const text = 'a'.repeat(1000);
      const options: ChunkOptions = {
        chunkSize: 200,
        overlap: 50,
        breakAtSentences: false,
        breakAtWords: false,
        minChunkSize: 100,
      };
      const result = chunkText(text, options);

      expect(result.length).toBeGreaterThan(0);
      result.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(200);
        expect(chunk.length).toBeGreaterThanOrEqual(100);
      });
    });
  });

  describe('calculateChunkCount', () => {
    test('should return 1 for text smaller than chunk size', () => {
      expect(calculateChunkCount(50, { chunkSize: 100 })).toBe(1);
    });

    test('should calculate correct chunk count for larger text', () => {
      const count = calculateChunkCount(1000, { chunkSize: 100, overlap: 10 });
      expect(count).toBeGreaterThan(1);
      expect(count).toBeLessThan(15); // Approximate
    });

    test('should handle zero-length text', () => {
      expect(calculateChunkCount(0, { chunkSize: 100 })).toBe(1);
    });

    test('should account for overlap in calculation', () => {
      const countWithOverlap = calculateChunkCount(1000, {
        chunkSize: 100,
        overlap: 20,
      });
      const countWithoutOverlap = calculateChunkCount(1000, {
        chunkSize: 100,
        overlap: 0,
      });

      expect(countWithOverlap).toBeGreaterThan(countWithoutOverlap);
    });
  });

  describe('getOptimalChunkSize', () => {
    test('should return text length for text smaller than max', () => {
      expect(getOptimalChunkSize(50, 100)).toBe(50);
    });

    test('should distribute evenly for larger text', () => {
      const optimalSize = getOptimalChunkSize(1000, 100);
      expect(optimalSize).toBeGreaterThan(0);
      expect(optimalSize).toBeLessThanOrEqual(100);
    });

    test('should respect target chunks parameter', () => {
      const optimalSize = getOptimalChunkSize(1000, 200, 5);
      expect(optimalSize).toBe(200); // 1000 / 5
    });

    test('should handle edge cases', () => {
      expect(getOptimalChunkSize(1, 100)).toBe(1);
      expect(getOptimalChunkSize(0, 100)).toBe(0);
    });
  });

  describe('mergeSmallChunks', () => {
    test('should not modify chunks if all meet min size', () => {
      const chunks: TextChunk[] = [
        {
          text: 'a'.repeat(200),
          index: 0,
          startOffset: 0,
          endOffset: 200,
          length: 200,
          isFirst: true,
          isLast: false,
        },
        {
          text: 'b'.repeat(200),
          index: 1,
          startOffset: 200,
          endOffset: 400,
          length: 200,
          isFirst: false,
          isLast: true,
        },
      ];

      const result = mergeSmallChunks(chunks, 100);
      expect(result).toHaveLength(2);
    });

    test('should merge small chunks with next chunk', () => {
      const chunks: TextChunk[] = [
        {
          text: 'small',
          index: 0,
          startOffset: 0,
          endOffset: 5,
          length: 5,
          isFirst: true,
          isLast: false,
        },
        {
          text: 'large'.repeat(50),
          index: 1,
          startOffset: 5,
          endOffset: 255,
          length: 250,
          isFirst: false,
          isLast: true,
        },
      ];

      const result = mergeSmallChunks(chunks, 100);
      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('small');
      expect(result[0].text).toContain('large');
    });

    test('should handle single chunk', () => {
      const chunks: TextChunk[] = [
        {
          text: 'test',
          index: 0,
          startOffset: 0,
          endOffset: 4,
          length: 4,
          isFirst: true,
          isLast: true,
        },
      ];

      const result = mergeSmallChunks(chunks, 100);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('test');
    });

    test('should update indices after merging', () => {
      const chunks: TextChunk[] = [
        {
          text: 'a',
          index: 0,
          startOffset: 0,
          endOffset: 1,
          length: 1,
          isFirst: true,
          isLast: false,
        },
        {
          text: 'b'.repeat(50),
          index: 1,
          startOffset: 1,
          endOffset: 51,
          length: 50,
          isFirst: false,
          isLast: false,
        },
        {
          text: 'c'.repeat(50),
          index: 2,
          startOffset: 51,
          endOffset: 101,
          length: 50,
          isFirst: false,
          isLast: true,
        },
      ];

      const result = mergeSmallChunks(chunks, 10);
      result.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
      });
    });

    test('should preserve isFirst and isLast flags', () => {
      const chunks: TextChunk[] = [
        {
          text: 'a',
          index: 0,
          startOffset: 0,
          endOffset: 1,
          length: 1,
          isFirst: true,
          isLast: false,
        },
        {
          text: 'b'.repeat(50),
          index: 1,
          startOffset: 1,
          endOffset: 51,
          length: 50,
          isFirst: false,
          isLast: true,
        },
      ];

      const result = mergeSmallChunks(chunks, 10);
      expect(result[0].isFirst).toBe(true);
      expect(result[result.length - 1].isLast).toBe(true);
    });
  });

  describe('rechunkText', () => {
    test('should re-chunk with new options', () => {
      const originalChunks = chunkText('a'.repeat(1000), {
        chunkSize: 100,
        overlap: 10,
      });

      const reChunked = rechunkText(originalChunks, {
        chunkSize: 200,
        overlap: 20,
      });

      expect(reChunked.length).not.toBe(originalChunks.length);
      expect(reChunked.length).toBeGreaterThan(0);
    });

    test('should handle empty chunks array', () => {
      const result = rechunkText([], { chunkSize: 100, overlap: 10 });
      expect(result).toEqual([]);
    });

    test('should reconstruct original text correctly', () => {
      const originalText = 'Hello world. This is a test. Another sentence.';
      const chunks = chunkText(originalText, { chunkSize: 20, overlap: 5 });
      const reChunked = rechunkText(chunks, { chunkSize: 50, overlap: 10 });

      const reconstructed = reChunked.map((c) => c.text).join('');
      expect(reconstructed).toContain('Hello world');
      expect(reconstructed).toContain('Another sentence');
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle very small chunk sizes', () => {
      const text = 'Hello world';
      const result = chunkText(text, { chunkSize: 5, overlap: 2 });

      expect(result.length).toBeGreaterThan(0);
      result.forEach((chunk) => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    test('should handle overlap larger than chunk size', () => {
      const text = 'a'.repeat(500);
      const result = chunkText(text, { chunkSize: 50, overlap: 100 });

      // Should still work but may have unusual behavior
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle text with only whitespace', () => {
      const text = '     \n\n\n     \t\t\t     ';
      const result = chunkText(text, { chunkSize: 20, overlap: 5 });

      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle very large text', () => {
      const text = 'a'.repeat(100000);
      const result = chunkText(text, { chunkSize: 1000, overlap: 100 });

      expect(result.length).toBeGreaterThan(10);
      expect(result[0].isFirst).toBe(true);
      expect(result[result.length - 1].isLast).toBe(true);
    });

    test('should handle text with mixed line endings', () => {
      const text = 'Line 1\rLine 2\nLine 3\r\nLine 4';
      const result = chunkText(text, { chunkSize: 20, overlap: 5 });

      expect(result.length).toBeGreaterThan(0);
    });
  });
});
