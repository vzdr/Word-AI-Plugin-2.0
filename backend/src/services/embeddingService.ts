/**
 * Embedding Service
 *
 * Generates vector embeddings for text using OpenAI's embedding API
 * Supports caching and batch processing for efficiency
 */

import OpenAI from 'openai';
import { EmbeddingService, RAGErrorType, RAGError } from '../types/rag';
import { createHash } from 'crypto';

/**
 * Cache for embeddings to avoid redundant API calls
 */
interface EmbeddingCache {
  [hash: string]: {
    embedding: number[];
    timestamp: number;
  };
}

/**
 * OpenAI Embedding Service Implementation
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private client: OpenAI;
  private model: string;
  private dimension: number;
  private cache: EmbeddingCache = {};
  private cacheEnabled: boolean;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Maximum tokens for embedding models
   */
  private readonly MAX_TOKENS = 8191;

  constructor(apiKey: string, model: string = 'text-embedding-3-small', cacheEnabled: boolean = true) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.cacheEnabled = cacheEnabled;

    // Set dimension based on model
    switch (model) {
      case 'text-embedding-3-small':
        this.dimension = 1536;
        break;
      case 'text-embedding-3-large':
        this.dimension = 3072;
        break;
      case 'text-embedding-ada-002':
        this.dimension = 1536;
        break;
      default:
        this.dimension = 1536;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * Processes in batches for efficiency
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Check cache first
      const cachedResults: (number[] | null)[] = [];
      const uncachedTexts: string[] = [];
      const uncachedIndices: number[] = [];

      if (this.cacheEnabled) {
        for (let i = 0; i < texts.length; i++) {
          const text = texts[i];
          const cached = this.getCachedEmbedding(text);
          if (cached) {
            cachedResults[i] = cached;
          } else {
            cachedResults[i] = null;
            uncachedTexts.push(text);
            uncachedIndices.push(i);
          }
        }

        console.log(
          `[Embedding Service] Cache hit: ${texts.length - uncachedTexts.length}/${texts.length}`
        );

        // If all cached, return immediately
        if (uncachedTexts.length === 0) {
          return cachedResults as number[][];
        }
      } else {
        uncachedTexts.push(...texts);
        uncachedIndices.push(...texts.map((_, i) => i));
      }

      // Generate embeddings for uncached texts
      // OpenAI allows up to 2048 inputs per request, but we'll use smaller batches
      const batchSize = 100;
      const allEmbeddings: number[][] = [];

      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);

        console.log(
          `[Embedding Service] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uncachedTexts.length / batchSize)}`
        );

        const response = await this.client.embeddings.create({
          model: this.model,
          input: batch,
          encoding_format: 'float',
        });

        const batchEmbeddings = response.data.map((item) => item.embedding);
        allEmbeddings.push(...batchEmbeddings);

        // Cache results
        if (this.cacheEnabled) {
          for (let j = 0; j < batch.length; j++) {
            this.cacheEmbedding(batch[j], batchEmbeddings[j]);
          }
        }
      }

      // Merge cached and new embeddings
      const finalEmbeddings: number[][] = [...cachedResults] as number[][];
      for (let i = 0; i < uncachedIndices.length; i++) {
        finalEmbeddings[uncachedIndices[i]] = allEmbeddings[i];
      }

      return finalEmbeddings;
    } catch (error: any) {
      console.error('[Embedding Service] Error generating embeddings:', error);
      throw this.createError(
        `Failed to generate embeddings: ${error.message}`,
        RAGErrorType.EMBEDDING_ERROR,
        error
      );
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  /**
   * Get embedding model information
   */
  getModelInfo(): { model: string; dimension: number; maxTokens: number } {
    return {
      model: this.model,
      dimension: this.dimension,
      maxTokens: this.MAX_TOKENS,
    };
  }

  /**
   * Get cached embedding for a text
   */
  private getCachedEmbedding(text: string): number[] | null {
    if (!this.cacheEnabled) {
      return null;
    }

    const hash = this.hashText(text);
    const cached = this.cache[hash];

    if (cached) {
      // Check if cache is still valid
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheTTL) {
        return cached.embedding;
      } else {
        // Expired, remove from cache
        delete this.cache[hash];
      }
    }

    return null;
  }

  /**
   * Cache an embedding
   */
  private cacheEmbedding(text: string, embedding: number[]): void {
    if (!this.cacheEnabled) {
      return;
    }

    const hash = this.hashText(text);
    this.cache[hash] = {
      embedding,
      timestamp: Date.now(),
    };
  }

  /**
   * Create a hash of text for cache key
   */
  private hashText(text: string): string {
    return createHash('md5').update(text).digest('hex');
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache = {};
    console.log('[Embedding Service] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; memoryUsage: number } {
    const size = Object.keys(this.cache).length;
    // Estimate memory usage (rough approximation)
    const memoryUsage = size * (this.dimension * 4 + 100); // 4 bytes per float + overhead
    return { size, memoryUsage };
  }

  /**
   * Create a RAG error
   */
  private createError(message: string, type: RAGErrorType, details?: any): RAGError {
    return {
      message,
      type,
      details,
    };
  }

  /**
   * Clean up old cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [hash, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp > this.cacheTTL) {
        delete this.cache[hash];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[Embedding Service] Cleaned ${cleaned} expired cache entries`);
    }
  }
}

/**
 * Create an embedding service instance
 */
export function createEmbeddingService(
  apiKey: string,
  model: string = 'text-embedding-3-small',
  cacheEnabled: boolean = true
): EmbeddingService {
  return new OpenAIEmbeddingService(apiKey, model, cacheEnabled);
}
