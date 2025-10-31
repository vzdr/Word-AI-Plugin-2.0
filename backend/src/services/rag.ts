/**
 * RAG Service Entry Point
 *
 * Provides a simple interface for creating and using RAG pipeline
 * Manages lifecycle of embedding service, vector store, and pipeline
 */

import {
  RAGPipeline,
  RAGConfig,
  RAGRequest,
  RAGResponse,
  DEFAULT_RAG_CONFIG,
  EmbeddingService,
  VectorStore,
} from '../types/rag';
import { createEmbeddingService } from './embeddingService';
import { createVectorStore } from './vectorStore';
import { createRAGPipeline } from './ragPipeline';
import { UploadedFile } from '../types/UploadedFile';

/**
 * RAG Service
 * High-level interface for RAG operations
 */
export class RAGService {
  private pipeline: RAGPipeline;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private config: RAGConfig;

  constructor(
    apiKey: string,
    config: Partial<RAGConfig> = {}
  ) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };

    // Initialize embedding service
    this.embeddingService = createEmbeddingService(
      apiKey,
      this.config.embeddingModel,
      this.config.cacheEmbeddings
    );

    // Initialize vector store
    this.vectorStore = createVectorStore(this.config);

    // Initialize pipeline
    this.pipeline = createRAGPipeline(
      this.embeddingService,
      this.vectorStore,
      this.config
    );

    console.log('[RAG Service] Initialized');
  }

  /**
   * Index files for retrieval
   */
  async indexFiles(files: UploadedFile[]): Promise<void> {
    return this.pipeline.indexFiles(files);
  }

  /**
   * Execute RAG query
   */
  async query(request: RAGRequest): Promise<RAGResponse> {
    return this.pipeline.query(request);
  }

  /**
   * Build context from files without full RAG pipeline
   * Useful for simple context injection
   */
  async buildContextFromFiles(files: UploadedFile[], query: string): Promise<string> {
    // Index files if not already indexed
    const stats = await this.getStats();
    if (stats.documentCount === 0 && files.length > 0) {
      await this.indexFiles(files);
    }

    // Execute query
    const response = await this.query({
      query,
      documents: [],
      config: this.config,
    });

    // Return built context
    return this.pipeline.buildContext(response.retrievedChunks);
  }

  /**
   * Clear all indexed documents
   */
  async clear(): Promise<void> {
    return this.pipeline.clearIndex();
  }

  /**
   * Get RAG statistics
   */
  async getStats(): Promise<{
    indexed: boolean;
    documentCount: number;
    chunkCount: number;
    memoryUsage: number;
  }> {
    return this.pipeline.getStats();
  }

  /**
   * Get current configuration
   */
  getConfig(): RAGConfig {
    return this.pipeline.getConfig();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
    this.pipeline.updateConfig(this.config);
  }
}

/**
 * Create a RAG service instance
 */
export function createRAGService(
  apiKey: string,
  config: Partial<RAGConfig> = {}
): RAGService {
  return new RAGService(apiKey, config);
}

// Re-export types and utilities
export * from '../types/rag';
export { createEmbeddingService } from './embeddingService';
export { createVectorStore } from './vectorStore';
export { createDocumentProcessor } from './documentProcessor';
export { createRAGPipeline } from './ragPipeline';
