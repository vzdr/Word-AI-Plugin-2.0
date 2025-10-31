/**
 * RAG Pipeline
 *
 * Orchestrates the entire RAG (Retrieval-Augmented Generation) flow:
 * 1. Document indexing (chunking + embedding)
 * 2. Query processing (embedding + retrieval)
 * 3. Context augmentation
 * 4. LLM generation with retrieved context
 *
 * Based on RAG-Sequence approach from "Retrieval-Augmented Generation
 * for Knowledge-Intensive NLP Tasks" (Lewis et al., 2020)
 */

import {
  RAGPipeline,
  RAGConfig,
  RAGDocument,
  RAGRequest,
  RAGResponse,
  RAGQuery,
  RAGMetrics,
  RAGErrorType,
  RAGError,
  DEFAULT_RAG_CONFIG,
  RetrievedChunk,
} from '../types/rag';
import { EmbeddingService } from '../types/rag';
import { VectorStore } from '../types/rag';
import { DocumentProcessor } from './documentProcessor';
import { UploadedFile } from '../types/UploadedFile';

/**
 * RAG Pipeline Implementation
 */
export class RAGPipelineImpl implements RAGPipeline {
  private config: RAGConfig;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private documentProcessor: DocumentProcessor;
  private indexed: boolean = false;

  constructor(
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    config: Partial<RAGConfig> = {}
  ) {
    this.config = { ...DEFAULT_RAG_CONFIG, ...config };
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.documentProcessor = new DocumentProcessor(embeddingService, this.config);

    console.log('[RAG Pipeline] Initialized with config:', this.config);
  }

  /**
   * Index documents for retrieval
   */
  async indexDocuments(documents: RAGDocument[]): Promise<void> {
    try {
      if (documents.length === 0) {
        throw this.createError(
          'No documents provided for indexing',
          RAGErrorType.NO_DOCUMENTS
        );
      }

      console.log(`[RAG Pipeline] Indexing ${documents.length} documents`);

      // Add documents to vector store
      await this.vectorStore.addDocuments(documents);

      this.indexed = true;

      const stats = await this.vectorStore.getStats();
      console.log(`[RAG Pipeline] Indexed successfully:`, stats);
    } catch (error: any) {
      console.error('[RAG Pipeline] Indexing error:', error);
      throw error;
    }
  }

  /**
   * Index files directly (convenience method)
   */
  async indexFiles(files: UploadedFile[]): Promise<void> {
    try {
      console.log(`[RAG Pipeline] Processing and indexing ${files.length} files`);

      // Process files into documents
      const documents = await this.documentProcessor.processFiles(files);

      if (documents.length === 0) {
        throw this.createError(
          'No documents were successfully processed',
          RAGErrorType.PARSING_ERROR
        );
      }

      // Index the documents
      await this.indexDocuments(documents);
    } catch (error: any) {
      console.error('[RAG Pipeline] File indexing error:', error);
      throw error;
    }
  }

  /**
   * Execute RAG query
   */
  async query(request: RAGRequest): Promise<RAGResponse> {
    const startTime = Date.now();

    try {
      // Check if documents are indexed
      if (!this.indexed) {
        console.log('[RAG Pipeline] No documents indexed, indexing from request');
        if (request.documents && request.documents.length > 0) {
          await this.indexDocuments(request.documents);
        } else {
          throw this.createError(
            'No documents indexed and no documents in request',
            RAGErrorType.NO_DOCUMENTS
          );
        }
      }

      console.log(`[RAG Pipeline] Processing query: "${request.query.substring(0, 100)}..."`);

      // Step 1: Generate query embedding
      const embeddingStartTime = Date.now();
      const queryEmbedding = await this.embeddingService.generateEmbedding(request.query);
      const embeddingTime = Date.now() - embeddingStartTime;

      console.log(`[RAG Pipeline] Generated query embedding in ${embeddingTime}ms`);

      // Step 2: Retrieve relevant chunks
      const retrievalStartTime = Date.now();
      const ragQuery: RAGQuery = {
        text: request.query,
        embedding: queryEmbedding,
        topK: request.config?.topK || this.config.topK,
        minSimilarity: request.config?.minSimilarity || this.config.minSimilarity,
      };

      const retrievalResult = await this.vectorStore.search(ragQuery);
      const retrievalTime = Date.now() - retrievalStartTime;

      console.log(
        `[RAG Pipeline] Retrieved ${retrievalResult.results.length} chunks in ${retrievalTime}ms`
      );

      // Step 3: Build augmented context
      const context = this.buildContext(retrievalResult.results, request.inlineContext);

      console.log(`[RAG Pipeline] Built context with ${context.length} characters`);

      // Step 4: Compute metrics
      const metrics = this.computeMetrics(retrievalResult.results);

      // Build response (generation will be done by the caller)
      const response: RAGResponse = {
        answer: '', // Will be filled by the AI service
        retrievedChunks: retrievalResult.results,
        sources: this.buildSources(retrievalResult.results),
        metrics,
        timing: {
          retrievalTime,
          generationTime: 0, // Will be filled by caller
          totalTime: Date.now() - startTime,
        },
      };

      console.log('[RAG Pipeline] Query completed:', {
        retrievedChunks: response.retrievedChunks.length,
        sources: response.sources.length,
        totalTime: response.timing?.totalTime || 0,
      });

      return response;
    } catch (error: any) {
      console.error('[RAG Pipeline] Query error:', error);
      throw error;
    }
  }

  /**
   * Build context from retrieved chunks
   */
  buildContext(retrievedChunks: RetrievedChunk[], inlineContext?: string): string {
    const sections: string[] = [];

    // Add retrieved context
    if (retrievedChunks.length > 0) {
      sections.push('=== RETRIEVED CONTEXT FROM DOCUMENTS ===\n');

      retrievedChunks.forEach((retrieved, index) => {
        const chunk = retrieved.chunk;
        sections.push(`--- Source ${index + 1}: ${chunk.source.fileName} (Chunk ${chunk.source.chunkIndex + 1}/${chunk.source.totalChunks}, Relevance: ${(retrieved.score * 100).toFixed(1)}%) ---`);
        sections.push(chunk.text);
        sections.push('');
      });
    }

    // Add inline context if provided
    if (inlineContext && inlineContext.trim()) {
      sections.push('=== ADDITIONAL CONTEXT ===');
      sections.push(inlineContext);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Build sources list from retrieved chunks
   */
  private buildSources(retrievedChunks: RetrievedChunk[]): RAGResponse['sources'] {
    return retrievedChunks.map((retrieved) => {
      const chunk = retrieved.chunk;
      return {
        fileName: chunk.source.fileName,
        chunkIndex: chunk.source.chunkIndex,
        text: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
        score: retrieved.score,
      };
    });
  }

  /**
   * Compute RAG metrics
   */
  private computeMetrics(retrievedChunks: RetrievedChunk[]): RAGMetrics {
    if (retrievedChunks.length === 0) {
      return {
        chunksUsed: 0,
        averageRetrievalScore: 0,
        contextRelevance: 0,
      };
    }

    // Calculate average retrieval score
    const totalScore = retrievedChunks.reduce((sum, chunk) => sum + chunk.score, 0);
    const averageRetrievalScore = totalScore / retrievedChunks.length;

    // Context relevance is based on average score
    // Higher average score = more relevant context
    const contextRelevance = averageRetrievalScore;

    return {
      chunksUsed: retrievedChunks.length,
      averageRetrievalScore,
      contextRelevance,
      // faithfulness and answerRelevance would require analyzing the generated answer
      // These can be computed after generation in the AI service
    };
  }

  /**
   * Get configuration
   */
  getConfig(): RAGConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RAGConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[RAG Pipeline] Updated config:', this.config);
  }

  /**
   * Clear indexed documents
   */
  async clearIndex(): Promise<void> {
    await this.vectorStore.clear();
    this.indexed = false;
    console.log('[RAG Pipeline] Cleared index');
  }

  /**
   * Get pipeline statistics
   */
  async getStats(): Promise<{
    indexed: boolean;
    documentCount: number;
    chunkCount: number;
    memoryUsage: number;
  }> {
    const vectorStats = await this.vectorStore.getStats();
    return {
      indexed: this.indexed,
      ...vectorStats,
    };
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
 * Create a RAG pipeline instance
 */
export function createRAGPipeline(
  embeddingService: EmbeddingService,
  vectorStore: VectorStore,
  config: Partial<RAGConfig> = {}
): RAGPipeline {
  return new RAGPipelineImpl(embeddingService, vectorStore, config);
}
