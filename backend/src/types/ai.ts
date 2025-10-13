/**
 * AI Types for Word AI Plugin Backend
 *
 * Defines types and interfaces for AI operations, including
 * requests, responses, and configuration
 */

/**
 * Source attribution for AI responses
 */
export interface Source {
  /**
   * Name of the source file or context
   */
  file: string;

  /**
   * Relevant text chunk from the source
   */
  chunk: string;

  /**
   * Optional confidence score (0-1)
   */
  confidence?: number;

  /**
   * Optional page number or location reference
   */
  location?: string;
}

/**
 * AI model settings
 */
export interface AISettings {
  /**
   * OpenAI model to use (e.g., "gpt-3.5-turbo", "gpt-4")
   */
  model: string;

  /**
   * Temperature for response generation (0-2)
   * Lower values = more focused, higher values = more creative
   */
  temperature: number;

  /**
   * Maximum number of tokens to generate
   */
  maxTokens: number;

  /**
   * Optional top_p parameter for nucleus sampling
   */
  topP?: number;

  /**
   * Optional frequency penalty (-2.0 to 2.0)
   */
  frequencyPenalty?: number;

  /**
   * Optional presence penalty (-2.0 to 2.0)
   */
  presencePenalty?: number;

  /**
   * Whether to stream the response
   */
  stream?: boolean;
}

/**
 * Context from uploaded files
 */
export interface FileContext {
  /**
   * File name
   */
  fileName: string;

  /**
   * Parsed content from the file
   */
  content: string;

  /**
   * Optional file type
   */
  fileType?: string;

  /**
   * Optional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Request to AI service
 */
export interface AIRequest {
  /**
   * User's question or prompt
   */
  question: string;

  /**
   * Context from uploaded files (array of parsed file contents)
   */
  contextFiles: string[];

  /**
   * Additional inline context provided by user
   */
  inlineContext: string;

  /**
   * AI model settings
   */
  settings: AISettings;

  /**
   * Optional user ID for tracking
   */
  userId?: string;

  /**
   * Optional session ID for conversation continuity
   */
  sessionId?: string;
}

/**
 * Response from AI service
 */
export interface AIResponse {
  /**
   * Generated answer
   */
  answer: string;

  /**
   * Sources used to generate the answer
   */
  sources: Source[];

  /**
   * Model used for generation
   */
  model: string;

  /**
   * Number of tokens used
   */
  tokensUsed: number;

  /**
   * Whether the response was served from cache
   */
  cached: boolean;

  /**
   * Response time in seconds
   */
  responseTime: number;

  /**
   * Optional finish reason from OpenAI
   */
  finishReason?: string;

  /**
   * Optional warning messages
   */
  warnings?: string[];
}

/**
 * Default AI settings
 */
export const DEFAULT_AI_SETTINGS: AISettings = {
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stream: false,
};

/**
 * Supported AI models
 */
export enum AIModel {
  GPT_3_5_TURBO = 'gpt-3.5-turbo',
  GPT_3_5_TURBO_16K = 'gpt-3.5-turbo-16k',
  GPT_4 = 'gpt-4',
  GPT_4_TURBO = 'gpt-4-turbo-preview',
  GPT_4_32K = 'gpt-4-32k',
}

/**
 * Token usage breakdown
 */
export interface TokenUsage {
  /**
   * Tokens used in the prompt
   */
  promptTokens: number;

  /**
   * Tokens used in the completion
   */
  completionTokens: number;

  /**
   * Total tokens used
   */
  totalTokens: number;
}

/**
 * Prompt template for AI requests
 */
export interface PromptTemplate {
  /**
   * System message
   */
  system: string;

  /**
   * User message template
   */
  user: string;

  /**
   * Optional assistant message prefix
   */
  assistant?: string;
}

/**
 * Cache entry for AI responses
 */
export interface CacheEntry {
  /**
   * Cache key (hash of request)
   */
  key: string;

  /**
   * Cached response
   */
  response: AIResponse;

  /**
   * Timestamp when cached
   */
  cachedAt: Date;

  /**
   * TTL in seconds
   */
  ttl: number;

  /**
   * Number of cache hits
   */
  hits: number;
}

/**
 * AI service configuration
 */
export interface AIServiceConfig {
  /**
   * OpenAI API key
   */
  apiKey: string;

  /**
   * Optional organization ID
   */
  organizationId?: string;

  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Maximum number of retries
   */
  maxRetries?: number;

  /**
   * Base URL for OpenAI API (for custom endpoints)
   */
  baseURL?: string;
}

/**
 * Error types for AI operations
 */
export enum AIErrorType {
  INVALID_REQUEST = 'INVALID_REQUEST',
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  INSUFFICIENT_QUOTA = 'INSUFFICIENT_QUOTA',
  INVALID_MODEL = 'INVALID_MODEL',
  CONTEXT_TOO_LARGE = 'CONTEXT_TOO_LARGE',
  UNKNOWN = 'UNKNOWN',
}

/**
 * AI service error
 */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public type: AIErrorType,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}
