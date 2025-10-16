/**
 * Google Gemini Service for Word AI Plugin Backend
 *
 * Handles all interactions with Google Gemini API, including:
 * - Client initialization and configuration
 * - Request processing with context injection
 * - Response generation
 * - Error handling
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  AIServiceError,
  AIErrorType,
  DEFAULT_AI_SETTINGS,
} from '../types/ai';
import {
  buildPrompt,
  extractSources,
  cleanResponse,
  estimateTokenCount,
} from '../utils/promptBuilder';

/**
 * Gemini Service class
 */
export class GeminiService {
  private client: GoogleGenerativeAI;
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default timeout
      maxRetries: 3,
      ...config,
    };

    this.client = new GoogleGenerativeAI(this.config.apiKey);
  }

  /**
   * Process an AI request and generate a response
   */
  async processRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Validate request
      this.validateRequest(request);

      // Apply default settings
      const settings = { ...DEFAULT_AI_SETTINGS, ...request.settings };

      // Build prompt with context injection
      const prompt = buildPrompt(request);

      // Get model with system prompt
      const model = this.getModel(settings.model, prompt.system);

      // Call Gemini API
      const result = await model.generateContent(prompt.user);

      const response = await result.response;
      const responseText = response.text();

      // Clean response
      const cleanedResponse = cleanResponse(responseText);

      // Extract sources from response
      const sources = extractSources(cleanedResponse, request.contextFiles);

      // Calculate response time
      const responseTime = (Date.now() - startTime) / 1000;

      // Estimate token usage (Gemini doesn't always return usage)
      const promptTokens = estimateTokenCount(prompt.system + prompt.user);
      const completionTokens = estimateTokenCount(cleanedResponse);

      // Build AI response
      const aiResponse: AIResponse = {
        answer: cleanedResponse,
        sources,
        model: settings.model,
        tokensUsed: promptTokens + completionTokens,
        cached: false,
        responseTime,
      };

      return aiResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get Gemini model instance
   */
  private getModel(modelName: string, systemPrompt?: string): GenerativeModel {
    return this.client.getGenerativeModel({ 
      model: modelName,
      systemInstruction: systemPrompt,
    });
  }

  /**
   * Validate an AI request
   */
  private validateRequest(request: AIRequest): void {
    if (!request.question || request.question.trim().length === 0) {
      throw new AIServiceError(
        'Question is required',
        AIErrorType.INVALID_REQUEST,
        400
      );
    }

    if (request.question.length > 10000) {
      throw new AIServiceError(
        'Question exceeds maximum length of 10,000 characters',
        AIErrorType.INVALID_REQUEST,
        400
      );
    }

    if (request.settings) {
      const { temperature, maxTokens } = request.settings;

      if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
        throw new AIServiceError(
          'Temperature must be between 0 and 2',
          AIErrorType.INVALID_REQUEST,
          400
        );
      }

      if (maxTokens !== undefined && (maxTokens < 1 || maxTokens > 8192)) {
        throw new AIServiceError(
          'Max tokens must be between 1 and 8,192',
          AIErrorType.INVALID_REQUEST,
          400
        );
      }
    }
  }

  /**
   * Handle Gemini API errors
   */
  private handleError(error: any): AIServiceError {
    console.error('[Gemini Service] Error:', error);

    // Handle Gemini specific errors
    if (error?.message) {
      const message = error.message.toLowerCase();

      // Rate limit error
      if (message.includes('quota') || message.includes('rate limit')) {
        return new AIServiceError(
          'Rate limit exceeded. Please try again later.',
          AIErrorType.RATE_LIMIT,
          429,
          error
        );
      }

      // Authentication error
      if (message.includes('api key') || message.includes('authentication')) {
        return new AIServiceError(
          'Invalid API key or authentication failed',
          AIErrorType.AUTHENTICATION,
          401,
          error
        );
      }

      // Invalid request
      if (message.includes('invalid') || message.includes('bad request')) {
        return new AIServiceError(
          error.message || 'Invalid request to Gemini API',
          AIErrorType.INVALID_REQUEST,
          400,
          error
        );
      }

      // Context length exceeded
      if (message.includes('too long') || message.includes('context length')) {
        return new AIServiceError(
          'Context is too large. Please reduce the amount of text.',
          AIErrorType.CONTEXT_TOO_LARGE,
          400,
          error
        );
      }
    }

    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return new AIServiceError(
        'Request timed out. Please try again.',
        AIErrorType.TIMEOUT,
        408,
        error
      );
    }

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new AIServiceError(
        'Network error. Please check your connection.',
        AIErrorType.API_ERROR,
        503,
        error
      );
    }

    // Handle our own validation errors
    if (error instanceof AIServiceError) {
      return error;
    }

    // Unknown error
    return new AIServiceError(
      error.message || 'Unknown error occurred',
      AIErrorType.UNKNOWN,
      500,
      error
    );
  }

  /**
   * Test the connection to Gemini API
   */
  async testConnection(): Promise<boolean> {
    try {
      const model = this.getModel('gemini-pro');
      const result = await model.generateContent('Hello');
      return !!result.response;
    } catch (error) {
      throw this.handleError(error);
    }
  }
}

/**
 * Create and initialize Gemini service
 */
export function createGeminiService(
  apiKey: string,
  config?: Partial<AIServiceConfig>
): GeminiService {
  if (!apiKey) {
    throw new AIServiceError(
      'Gemini API key is required',
      AIErrorType.AUTHENTICATION,
      401
    );
  }

  return new GeminiService({
    apiKey,
    ...config,
  });
}

/**
 * Singleton instance (optional, for convenience)
 */
let serviceInstance: GeminiService | null = null;

/**
 * Get or create singleton Gemini service instance
 */
export function getGeminiService(apiKey?: string): GeminiService {
  if (!serviceInstance) {
    if (!apiKey) {
      throw new AIServiceError(
        'Gemini API key is required for first initialization',
        AIErrorType.AUTHENTICATION,
        401
      );
    }
    serviceInstance = createGeminiService(apiKey);
  }
  return serviceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetGeminiService(): void {
  serviceInstance = null;
}
