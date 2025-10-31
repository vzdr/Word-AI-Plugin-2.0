/**
 * In-Memory Vector Store
 *
 * Simple vector store implementation for RAG
 * Supports cosine similarity, dot product, and Euclidean distance
 *
 * For production, this could be replaced with:
 * - FAISS (Facebook AI Similarity Search)
 * - Qdrant (vector database)
 * - Milvus (vector database)
 * - Pinecone (managed vector database)
 */

import {
  VectorStore,
  RAGDocument,
  DocumentChunk,
  RAGQuery,
  RetrievalResult,
  RetrievedChunk,
  RAGConfig,
  RAGErrorType,
  RAGError,
} from '../types/rag';

/**
 * In-memory vector store implementation
 */
export class InMemoryVectorStore implements VectorStore {
  private documents: Map<string, RAGDocument> = new Map();
  private chunks: Map<string, DocumentChunk> = new Map();
  private config: RAGConfig;

  constructor(config: RAGConfig) {
    this.config = config;
  }

  /**
   * Add documents to the store
   */
  async addDocuments(documents: RAGDocument[]): Promise<void> {
    try {
      for (const doc of documents) {
        // Validate document has chunks with embeddings
        if (!doc.chunks || doc.chunks.length === 0) {
          throw this.createError(
            `Document ${doc.id} has no chunks`,
            RAGErrorType.VECTOR_STORE_ERROR
          );
        }

        // Validate embeddings exist
        for (const chunk of doc.chunks) {
          if (!chunk.embedding || chunk.embedding.length === 0) {
            throw this.createError(
              `Chunk ${chunk.id} has no embedding`,
              RAGErrorType.VECTOR_STORE_ERROR
            );
          }

          // Validate embedding dimension
          if (chunk.embedding.length !== this.config.embeddingDimension) {
            throw this.createError(
              `Chunk ${chunk.id} has incorrect embedding dimension: ${chunk.embedding.length} (expected ${this.config.embeddingDimension})`,
              RAGErrorType.VECTOR_STORE_ERROR
            );
          }
        }

        // Store document
        this.documents.set(doc.id, doc);

        // Store chunks for quick lookup
        for (const chunk of doc.chunks) {
          this.chunks.set(chunk.id, chunk);
        }
      }

      console.log(
        `[Vector Store] Added ${documents.length} documents with ${this.chunks.size} total chunks`
      );
    } catch (error: any) {
      console.error('[Vector Store] Error adding documents:', error);
      throw error;
    }
  }

  /**
   * Remove documents from the store
   */
  async removeDocuments(documentIds: string[]): Promise<void> {
    try {
      for (const docId of documentIds) {
        const doc = this.documents.get(docId);
        if (doc && doc.chunks) {
          // Remove chunks
          for (const chunk of doc.chunks) {
            this.chunks.delete(chunk.id);
          }
        }
        // Remove document
        this.documents.delete(docId);
      }

      console.log(`[Vector Store] Removed ${documentIds.length} documents`);
    } catch (error: any) {
      console.error('[Vector Store] Error removing documents:', error);
      throw this.createError(
        `Failed to remove documents: ${error.message}`,
        RAGErrorType.VECTOR_STORE_ERROR,
        error
      );
    }
  }

  /**
   * Search for similar chunks
   */
  async search(query: RAGQuery): Promise<RetrievalResult> {
    const startTime = Date.now();

    try {
      if (!query.embedding || query.embedding.length === 0) {
        throw this.createError(
          'Query must have an embedding for search',
          RAGErrorType.RETRIEVAL_ERROR
        );
      }

      // Validate query embedding dimension
      if (query.embedding.length !== this.config.embeddingDimension) {
        throw this.createError(
          `Query embedding has incorrect dimension: ${query.embedding.length} (expected ${this.config.embeddingDimension})`,
          RAGErrorType.RETRIEVAL_ERROR
        );
      }

      // Get chunks to search (apply filters)
      const chunksToSearch = this.getFilteredChunks(query);

      if (chunksToSearch.length === 0) {
        console.warn('[Vector Store] No chunks to search');
        return {
          query,
          results: [],
          totalChunks: 0,
          documentsSearched: this.documents.size,
          retrievalTime: Date.now() - startTime,
        };
      }

      console.log(`[Vector Store] Searching ${chunksToSearch.length} chunks`);

      // Compute similarities
      const similarityStartTime = Date.now();
      const scoredChunks: Array<{ chunk: DocumentChunk; score: number }> = [];

      for (const chunk of chunksToSearch) {
        if (!chunk.embedding) continue;

        const score = this.computeSimilarity(
          query.embedding,
          chunk.embedding,
          this.config.similarityMetric
        );

        // Apply minimum similarity threshold
        const minSimilarity = query.minSimilarity ?? this.config.minSimilarity;
        if (score >= minSimilarity) {
          scoredChunks.push({ chunk, score });
        }
      }

      const similarityTime = Date.now() - similarityStartTime;

      // Sort by score descending
      scoredChunks.sort((a, b) => b.score - a.score);

      // Take top K
      const topK = query.topK ?? this.config.topK;
      const topChunks = scoredChunks.slice(0, topK);

      // Create retrieved chunks with rank
      const results: RetrievedChunk[] = topChunks.map((item, index) => ({
        chunk: item.chunk,
        score: item.score,
        rank: index,
      }));

      const retrievalTime = Date.now() - startTime;

      console.log(
        `[Vector Store] Retrieved ${results.length} chunks in ${retrievalTime}ms (similarity: ${similarityTime}ms)`
      );

      return {
        query,
        results,
        totalChunks: chunksToSearch.length,
        documentsSearched: this.documents.size,
        retrievalTime,
        metadata: {
          similarityTime,
          cacheHit: false, // In-memory store doesn't have cache
        },
      };
    } catch (error: any) {
      console.error('[Vector Store] Search error:', error);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId: string): Promise<RAGDocument | null> {
    return this.documents.get(documentId) || null;
  }

  /**
   * Get all documents
   */
  async getAllDocuments(): Promise<RAGDocument[]> {
    return Array.from(this.documents.values());
  }

  /**
   * Clear all documents
   */
  async clear(): Promise<void> {
    this.documents.clear();
    this.chunks.clear();
    console.log('[Vector Store] Cleared all documents and chunks');
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<{
    documentCount: number;
    chunkCount: number;
    memoryUsage: number;
  }> {
    const documentCount = this.documents.size;
    const chunkCount = this.chunks.size;

    // Estimate memory usage
    // Rough estimate: embedding size + text + metadata
    let memoryUsage = 0;
    for (const chunk of this.chunks.values()) {
      memoryUsage += (chunk.embedding?.length || 0) * 4; // 4 bytes per float
      memoryUsage += chunk.text.length * 2; // 2 bytes per char (UTF-16)
      memoryUsage += 200; // Metadata overhead
    }

    return {
      documentCount,
      chunkCount,
      memoryUsage,
    };
  }

  /**
   * Get chunks filtered by query constraints
   */
  private getFilteredChunks(query: RAGQuery): DocumentChunk[] {
    let chunks = Array.from(this.chunks.values());

    // Filter by document IDs
    if (query.documentIds && query.documentIds.length > 0) {
      const docIdSet = new Set(query.documentIds);
      chunks = chunks.filter((chunk) => {
        // Find parent document
        for (const doc of this.documents.values()) {
          if (doc.id && docIdSet.has(doc.id)) {
            return doc.chunks?.some((c) => c.id === chunk.id) || false;
          }
        }
        return false;
      });
    }

    // Filter by file types
    if (query.fileTypes && query.fileTypes.length > 0) {
      const fileTypeSet = new Set(query.fileTypes);
      chunks = chunks.filter((chunk) => fileTypeSet.has(chunk.source.fileType));
    }

    // Filter by metadata
    if (query.metadataFilters) {
      chunks = chunks.filter((chunk) => {
        if (!chunk.metadata) return false;
        for (const [key, value] of Object.entries(query.metadataFilters!)) {
          if (chunk.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return chunks;
  }

  /**
   * Compute similarity between two vectors
   */
  private computeSimilarity(
    vec1: number[],
    vec2: number[],
    metric: 'cosine' | 'euclidean' | 'dot'
  ): number {
    if (vec1.length !== vec2.length) {
      throw this.createError(
        `Vector dimensions don't match: ${vec1.length} vs ${vec2.length}`,
        RAGErrorType.VECTOR_STORE_ERROR
      );
    }

    switch (metric) {
      case 'cosine':
        return this.cosineSimilarity(vec1, vec2);
      case 'dot':
        return this.dotProduct(vec1, vec2);
      case 'euclidean':
        return this.euclideanSimilarity(vec1, vec2);
      default:
        throw this.createError(
          `Unknown similarity metric: ${metric}`,
          RAGErrorType.CONFIG_ERROR
        );
    }
  }

  /**
   * Cosine similarity (most common for embeddings)
   * Returns value between 0 and 1 (higher is more similar)
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    // Return normalized to 0-1 range
    return (dotProduct / magnitude + 1) / 2;
  }

  /**
   * Dot product (MIPS - Maximum Inner Product Search)
   * Used in original RAG paper with FAISS
   */
  private dotProduct(vec1: number[], vec2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
      sum += vec1[i] * vec2[i];
    }
    return sum;
  }

  /**
   * Euclidean distance converted to similarity
   * Returns value between 0 and 1 (higher is more similar)
   */
  private euclideanSimilarity(vec1: number[], vec2: number[]): number {
    let sumSquares = 0;
    for (let i = 0; i < vec1.length; i++) {
      const diff = vec1[i] - vec2[i];
      sumSquares += diff * diff;
    }
    const distance = Math.sqrt(sumSquares);

    // Convert distance to similarity (closer = more similar)
    // Using 1 / (1 + distance) to normalize to 0-1 range
    return 1 / (1 + distance);
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
}

/**
 * Create a vector store instance
 */
export function createVectorStore(config: RAGConfig): VectorStore {
  return new InMemoryVectorStore(config);
}
