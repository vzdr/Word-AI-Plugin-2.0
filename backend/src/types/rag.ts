/**
 * RAG (Retrieval-Augmented Generation) Type Definitions
 *
 * Based on research papers:
 * - "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (Lewis et al., 2020)
 * - "A System for Comprehensive Assessment of RAG Frameworks" (SCARF)
 * - "Diversity Enhances an LLM's Performance in RAG and Long Context Task"
 *
 * Implements RAG-Sequence approach where same retrieved documents are used for
 * entire sequence generation.
 */

/**
 * Configuration for the RAG system
 */
export interface RAGConfig {
  /**
   * Size of text chunks in characters
   * Original paper uses ~100 words, approximately 500-600 characters
   * @default 600
   */
  chunkSize: number;

  /**
   * Overlap between chunks in characters
   * Helps maintain context across chunk boundaries
   * @default 100
   */
  chunkOverlap: number;

  /**
   * Number of top chunks to retrieve for each query
   * Original paper uses k=5 for most tasks
   * @default 5
   */
  topK: number;

  /**
   * Minimum similarity score threshold (0-1)
   * Chunks below this threshold are not used
   * @default 0.3
   */
  minSimilarity: number;

  /**
   * Embedding model to use
   * Options: 'text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'
   * @default 'text-embedding-3-small'
   */
  embeddingModel: string;

  /**
   * Dimension of embeddings
   * text-embedding-3-small: 1536 dims
   * text-embedding-3-large: 3072 dims
   * @default 1536
   */
  embeddingDimension: number;

  /**
   * Maximum number of documents to process simultaneously
   * @default 10
   */
  maxDocuments: number;

  /**
   * Cache embeddings for faster subsequent queries
   * @default true
   */
  cacheEmbeddings: boolean;

  /**
   * Similarity metric to use
   * 'cosine': Cosine similarity (most common)
   * 'euclidean': Euclidean distance
   * 'dot': Dot product (MIPS - Maximum Inner Product Search)
   * @default 'cosine'
   */
  similarityMetric: 'cosine' | 'euclidean' | 'dot';
}

/**
 * Default RAG configuration based on research papers
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  chunkSize: 600,
  chunkOverlap: 100,
  topK: 5,
  minSimilarity: 0.3,
  embeddingModel: 'text-embedding-3-small',
  embeddingDimension: 1536,
  maxDocuments: 10,
  cacheEmbeddings: true,
  similarityMetric: 'cosine',
};

/**
 * Represents a single document chunk with its embedding
 */
export interface DocumentChunk {
  /**
   * Unique identifier for this chunk
   */
  id: string;

  /**
   * Text content of the chunk
   */
  text: string;

  /**
   * Embedding vector for this chunk
   */
  embedding?: number[];

  /**
   * Source document metadata
   */
  source: {
    /**
     * Original file name
     */
    fileName: string;

    /**
     * File type (pdf, docx, txt, etc.)
     */
    fileType: string;

    /**
     * Position of this chunk within the source document
     */
    chunkIndex: number;

    /**
     * Total number of chunks from this document
     */
    totalChunks: number;

    /**
     * Character offset in original document
     */
    startOffset: number;

    /**
     * Character end position in original document
     */
    endOffset: number;
  };

  /**
   * Metadata for additional context
   */
  metadata?: {
    /**
     * Title or heading if chunk is from a section
     */
    heading?: string;

    /**
     * Page number if applicable (PDF, DOCX)
     */
    pageNumber?: number;

    /**
     * Creation timestamp
     */
    createdAt: number;

    /**
     * Custom metadata
     */
    [key: string]: any;
  };
}

/**
 * Document to be indexed in RAG system
 */
export interface RAGDocument {
  /**
   * Unique document identifier
   */
  id: string;

  /**
   * Original file name
   */
  fileName: string;

  /**
   * File type
   */
  fileType: string;

  /**
   * Full text content of the document
   */
  content: string;

  /**
   * MIME type
   */
  mimeType: string;

  /**
   * Document metadata
   */
  metadata?: {
    /**
     * Upload timestamp
     */
    uploadedAt: number;

    /**
     * File size in bytes
     */
    fileSize: number;

    /**
     * Number of characters
     */
    characterCount: number;

    /**
     * Custom metadata
     */
    [key: string]: any;
  };

  /**
   * Chunks created from this document
   */
  chunks?: DocumentChunk[];
}

/**
 * Query for retrieving relevant chunks
 */
export interface RAGQuery {
  /**
   * Query text
   */
  text: string;

  /**
   * Query embedding vector
   */
  embedding?: number[];

  /**
   * Number of results to return
   * @default config.topK
   */
  topK?: number;

  /**
   * Minimum similarity threshold
   * @default config.minSimilarity
   */
  minSimilarity?: number;

  /**
   * Filter by specific document IDs
   */
  documentIds?: string[];

  /**
   * Filter by file types
   */
  fileTypes?: string[];

  /**
   * Additional metadata filters
   */
  metadataFilters?: {
    [key: string]: any;
  };
}

/**
 * Retrieved chunk with similarity score
 */
export interface RetrievedChunk {
  /**
   * The document chunk
   */
  chunk: DocumentChunk;

  /**
   * Similarity score (0-1, higher is better)
   */
  score: number;

  /**
   * Rank in retrieved results (0-indexed)
   */
  rank: number;
}

/**
 * Result of a RAG retrieval operation
 */
export interface RetrievalResult {
  /**
   * Query that was executed
   */
  query: RAGQuery;

  /**
   * Retrieved chunks with scores
   */
  results: RetrievedChunk[];

  /**
   * Total number of chunks searched
   */
  totalChunks: number;

  /**
   * Number of documents searched
   */
  documentsSearched: number;

  /**
   * Time taken for retrieval in milliseconds
   */
  retrievalTime: number;

  /**
   * Metadata about the retrieval
   */
  metadata?: {
    /**
     * Embedding generation time
     */
    embeddingTime?: number;

    /**
     * Similarity computation time
     */
    similarityTime?: number;

    /**
     * Cache hit/miss information
     */
    cacheHit?: boolean;
  };
}

/**
 * RAG-augmented AI request
 */
export interface RAGRequest {
  /**
   * User query
   */
  query: string;

  /**
   * Documents to use for retrieval
   */
  documents: RAGDocument[];

  /**
   * RAG configuration
   */
  config?: Partial<RAGConfig>;

  /**
   * Additional inline context (not indexed)
   */
  inlineContext?: string;

  /**
   * AI model settings
   */
  modelSettings?: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
}

/**
 * RAG-augmented AI response
 */
export interface RAGResponse {
  /**
   * Generated answer
   */
  answer: string;

  /**
   * Retrieved chunks used for generation
   */
  retrievedChunks: RetrievedChunk[];

  /**
   * Sources cited in the response
   */
  sources: {
    fileName: string;
    chunkIndex: number;
    text: string;
    score: number;
  }[];

  /**
   * Evaluation metrics (if available)
   */
  metrics?: RAGMetrics;

  /**
   * Token usage information
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Processing time breakdown
   */
  timing?: {
    retrievalTime: number;
    generationTime: number;
    totalTime: number;
  };
}

/**
 * RAG evaluation metrics (based on RAGAS framework from SCARF paper)
 */
export interface RAGMetrics {
  /**
   * Faithfulness: How factually accurate is the answer based on retrieved context
   * Scale: 0-1 (higher is better)
   */
  faithfulness?: number;

  /**
   * Answer relevance: How relevant is the answer to the question
   * Scale: 0-1 (higher is better)
   */
  answerRelevance?: number;

  /**
   * Context relevance: How relevant are the retrieved chunks to the question
   * Scale: 0-1 (higher is better)
   */
  contextRelevance?: number;

  /**
   * Average similarity score of retrieved chunks
   */
  averageRetrievalScore?: number;

  /**
   * Number of chunks used for generation
   */
  chunksUsed?: number;

  /**
   * Whether the answer contains "INFO NOT FOUND" pattern
   */
  infoNotFound?: boolean;
}

/**
 * Vector store interface for RAG
 * Supports different backends (in-memory, FAISS, Qdrant, Milvus)
 */
export interface VectorStore {
  /**
   * Add documents to the store
   */
  addDocuments(documents: RAGDocument[]): Promise<void>;

  /**
   * Remove documents from the store
   */
  removeDocuments(documentIds: string[]): Promise<void>;

  /**
   * Search for similar chunks
   */
  search(query: RAGQuery): Promise<RetrievalResult>;

  /**
   * Get document by ID
   */
  getDocument(documentId: string): Promise<RAGDocument | null>;

  /**
   * Get all documents
   */
  getAllDocuments(): Promise<RAGDocument[]>;

  /**
   * Clear all documents
   */
  clear(): Promise<void>;

  /**
   * Get store statistics
   */
  getStats(): Promise<{
    documentCount: number;
    chunkCount: number;
    memoryUsage: number;
  }>;
}

/**
 * Embedding service interface
 */
export interface EmbeddingService {
  /**
   * Generate embeddings for texts
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Generate single embedding
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Get embedding model information
   */
  getModelInfo(): {
    model: string;
    dimension: number;
    maxTokens: number;
  };
}

/**
 * RAG pipeline orchestrator
 */
export interface RAGPipeline {
  /**
   * Index documents for retrieval
   */
  indexDocuments(documents: RAGDocument[]): Promise<void>;

  /**
   * Index files directly (convenience method)
   */
  indexFiles(files: any[]): Promise<void>;

  /**
   * Execute RAG query
   */
  query(request: RAGRequest): Promise<RAGResponse>;

  /**
   * Build context from retrieved chunks
   */
  buildContext(retrievedChunks: RetrievedChunk[], inlineContext?: string): string;

  /**
   * Get configuration
   */
  getConfig(): RAGConfig;

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RAGConfig>): void;

  /**
   * Clear indexed documents
   */
  clearIndex(): Promise<void>;

  /**
   * Get pipeline statistics
   */
  getStats(): Promise<{
    indexed: boolean;
    documentCount: number;
    chunkCount: number;
    memoryUsage: number;
  }>;
}

/**
 * Error types for RAG operations
 */
export enum RAGErrorType {
  /** Document parsing failed */
  PARSING_ERROR = 'PARSING_ERROR',

  /** Embedding generation failed */
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',

  /** Vector store operation failed */
  VECTOR_STORE_ERROR = 'VECTOR_STORE_ERROR',

  /** Retrieval failed */
  RETRIEVAL_ERROR = 'RETRIEVAL_ERROR',

  /** Configuration error */
  CONFIG_ERROR = 'CONFIG_ERROR',

  /** No documents indexed */
  NO_DOCUMENTS = 'NO_DOCUMENTS',

  /** Query too long */
  QUERY_TOO_LONG = 'QUERY_TOO_LONG',

  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * RAG error
 */
export interface RAGError {
  message: string;
  type: RAGErrorType;
  details?: any;
}
