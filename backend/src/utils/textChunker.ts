/**
 * Text Chunking Utility
 *
 * Splits large text into manageable chunks with configurable overlap
 */

import { TextChunk } from '../types/parser';

/**
 * Options for text chunking
 */
export interface ChunkOptions {
  /**
   * Maximum size of each chunk in characters
   * @default 4000
   */
  chunkSize?: number;

  /**
   * Number of characters to overlap between chunks
   * @default 200
   */
  overlap?: number;

  /**
   * Whether to try to break at sentence boundaries
   * @default true
   */
  breakAtSentences?: boolean;

  /**
   * Whether to try to break at word boundaries
   * @default true
   */
  breakAtWords?: boolean;

  /**
   * Minimum chunk size - chunks smaller than this will be merged with previous
   * @default 100
   */
  minChunkSize?: number;
}

/**
 * Default chunking options
 */
const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  chunkSize: 4000,
  overlap: 200,
  breakAtSentences: true,
  breakAtWords: true,
  minChunkSize: 100,
};

/**
 * Split text into chunks with overlap
 */
export function chunkText(text: string, options?: ChunkOptions): TextChunk[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };

  // Handle empty text
  if (!text || text.length === 0) {
    return [];
  }

  // If text is smaller than chunk size, return as single chunk
  if (text.length <= opts.chunkSize) {
    return [
      {
        text,
        index: 0,
        startOffset: 0,
        endOffset: text.length,
        length: text.length,
        isFirst: true,
        isLast: true,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let currentPosition = 0;
  let chunkIndex = 0;

  while (currentPosition < text.length) {
    // Calculate end position for this chunk
    let endPosition = Math.min(currentPosition + opts.chunkSize, text.length);

    // Try to break at a sentence boundary if not at the end
    if (opts.breakAtSentences && endPosition < text.length) {
      endPosition = findSentenceBoundary(text, currentPosition, endPosition);
    }

    // If sentence boundary didn't work, try word boundary
    if (opts.breakAtWords && endPosition < text.length && endPosition === currentPosition + opts.chunkSize) {
      endPosition = findWordBoundary(text, currentPosition, endPosition);
    }

    // Extract chunk text
    const chunkText = text.slice(currentPosition, endPosition);

    // Only add chunk if it meets minimum size or is the last chunk
    if (chunkText.length >= opts.minChunkSize || endPosition >= text.length) {
      chunks.push({
        text: chunkText,
        index: chunkIndex,
        startOffset: currentPosition,
        endOffset: endPosition,
        length: chunkText.length,
        isFirst: chunkIndex === 0,
        isLast: endPosition >= text.length,
      });
      chunkIndex++;
    }

    // Move to next chunk position, accounting for overlap
    currentPosition = endPosition - opts.overlap;

    // Ensure we're making progress
    if (currentPosition <= chunks[chunks.length - 1]?.startOffset && endPosition < text.length) {
      currentPosition = endPosition;
    }
  }

  // Update isLast flag for the actual last chunk
  if (chunks.length > 0) {
    chunks[chunks.length - 1].isLast = true;
  }

  return chunks;
}

/**
 * Find the best sentence boundary near the target position
 */
function findSentenceBoundary(text: string, start: number, target: number): number {
  // Sentence ending punctuation
  const sentenceEnders = /[.!?]\s/g;

  // Search backwards from target position for sentence ender
  const searchText = text.slice(start, target);
  let bestPosition = target;
  let lastMatch: RegExpExecArray | null = null;

  sentenceEnders.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEnders.exec(searchText)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    // Position after the sentence ender and space
    bestPosition = start + lastMatch.index + lastMatch[0].length;
  }

  return bestPosition;
}

/**
 * Find the best word boundary near the target position
 */
function findWordBoundary(text: string, start: number, target: number): number {
  // Look backwards from target for whitespace
  let position = target;

  while (position > start && position > target - 100) {
    const char = text[position];
    if (char === ' ' || char === '\n' || char === '\t') {
      return position + 1; // Position after the whitespace
    }
    position--;
  }

  // If no whitespace found within 100 chars, just use target
  return target;
}

/**
 * Calculate total number of chunks for a given text length
 */
export function calculateChunkCount(textLength: number, options?: ChunkOptions): number {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };

  if (textLength <= opts.chunkSize) {
    return 1;
  }

  // Approximate calculation
  const effectiveChunkSize = opts.chunkSize - opts.overlap;
  return Math.ceil((textLength - opts.overlap) / effectiveChunkSize);
}

/**
 * Get optimal chunk size for a given text length
 * Tries to create chunks of similar sizes
 */
export function getOptimalChunkSize(
  textLength: number,
  maxChunkSize: number = 4000,
  targetChunks?: number
): number {
  if (textLength <= maxChunkSize) {
    return textLength;
  }

  if (targetChunks) {
    return Math.ceil(textLength / targetChunks);
  }

  // Calculate chunk size that distributes text evenly
  const minChunks = Math.ceil(textLength / maxChunkSize);
  return Math.ceil(textLength / minChunks);
}

/**
 * Merge small chunks with adjacent chunks
 */
export function mergeSmallChunks(chunks: TextChunk[], minSize: number = 100): TextChunk[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: TextChunk[] = [];
  let i = 0;

  while (i < chunks.length) {
    const current = chunks[i];

    // If chunk is too small and not the last chunk, merge with next
    if (current.length < minSize && i < chunks.length - 1) {
      const next = chunks[i + 1];
      const mergedText = current.text + next.text;

      merged.push({
        text: mergedText,
        index: merged.length,
        startOffset: current.startOffset,
        endOffset: next.endOffset,
        length: mergedText.length,
        isFirst: current.isFirst,
        isLast: next.isLast,
      });

      i += 2; // Skip next chunk as it's merged
    } else {
      merged.push({
        ...current,
        index: merged.length,
      });
      i++;
    }
  }

  return merged;
}

/**
 * Re-chunk text with different options
 */
export function rechunkText(chunks: TextChunk[], newOptions: ChunkOptions): TextChunk[] {
  // Reconstruct original text from chunks
  const originalText = chunks.map((chunk) => chunk.text).join('');
  return chunkText(originalText, newOptions);
}
