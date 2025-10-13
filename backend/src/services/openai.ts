/**
 * OpenAI Service for Word AI Plugin Backend
 *
 * Handles all interactions with OpenAI API, including:
 * - Client initialization and configuration
 * - Request processing with RAG pattern
 * - Response generation and streaming
 * - Error handling and retries
 * - Source attribution
 */

import OpenAI from 'openai';
import {
  AIRequest,
  AIResponse,
  AIServiceConfig,
  AIServiceError,
  AIErrorType,
  Source,
  TokenUsage,
  DEFAULT_AI_SETTINGS,
} from '../types/ai';
import {
  buildPrompt,
  extractSources,
  cleanResponse,
  estimateTokenCount,
  validatePromptLength,
  truncateContextToFit,
} from '../utils/promptBuilder';

/**
 * OpenAI Service class
 */
export class OpenAIService {
  private client: OpenAI;
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = {
      timeout: 30000, // 30 seconds default timeout
      maxRetries: 3,
      ...config,
    };

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      organization: this.config.organizationId,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      baseURL: this.config.baseURL,
    });
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

      // Validate prompt length and truncate if necessary
      const promptValidation = validatePromptLength(
        prompt,
        settings.maxTokens * 2 // Allow 2x maxTokens for input
      );

      let finalPrompt = prompt;
      if (!promptValidation.valid) {
        // Truncate context to fit within limits
        const systemTokens = estimateTokenCount(prompt.system);
        const truncated = truncateContextToFit(
          request.contextFiles,
          request.inlineContext,
          settings.maxTokens * 2,
          systemTokens
        );

        // Rebuild prompt with truncated context
        finalPrompt = buildPrompt({
          ...request,
          contextFiles: truncated.contextFiles,
          inlineContext: truncated.inlineContext,
        });
      }

      // Call OpenAI API
      const completion = await this.createCompletion(finalPrompt, settings);

      // Extract response text
      const responseText = completion.choices[0]?.message?.content || '';

      // Clean response
      const cleanedResponse = cleanResponse(responseText);

      // Extract sources from response
      const sources = extractSources(cleanedResponse, request.contextFiles);

      // Calculate response time
      const responseTime = (Date.now() - startTime) / 1000;

      // Build AI response
      const aiResponse: AIResponse = {
        answer: cleanedResponse,
        sources,
        model: completion.model,
        tokensUsed: completion.usage?.total_tokens || 0,
        cached: false,
        responseTime,
        finishReason: completion.choices[0]?.finish_reason || undefined,
      };

      return aiResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Process a streaming AI request
   */
  async *processStreamingRequest(
    request: AIRequest
  ): AsyncGenerator<string, AIResponse, undefined> {
    const startTime = Date.now();
    let fullResponse = '';
    let tokensUsed = 0;

    try {
      // Validate request
      this.validateRequest(request);

      // Apply default settings
      const settings = { ...DEFAULT_AI_SETTINGS, ...request.settings };

      // Build prompt
      const prompt = buildPrompt(request);

      // Create streaming completion
      const stream = await this.createStreamingCompletion(prompt, settings);

      // Stream chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          yield content;
        }
      }

      // Extract sources
      const sources = extractSources(fullResponse, request.contextFiles);

      // Calculate response time
      const responseTime = (Date.now() - startTime) / 1000;

      // Estimate tokens (since streaming doesn't return usage)
      tokensUsed = estimateTokenCount(fullResponse);

      // Return final response
      return {
        answer: fullResponse,
        sources,
        model: settings.model,
        tokensUsed,
        cached: false,
        responseTime,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a chat completion
   */
  private async createCompletion(
    prompt: { system: string; user: string },
    settings: typeof DEFAULT_AI_SETTINGS
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];

    return await this.client.chat.completions.create({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP,
      frequency_penalty: settings.frequencyPenalty,
      presence_penalty: settings.presencePenalty,
    });
  }

  /**
   * Create a streaming chat completion
   */
  private async createStreamingCompletion(
    prompt: { system: string; user: string },
    settings: typeof DEFAULT_AI_SETTINGS
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];

    return await this.client.chat.completions.create({
      model: settings.model,
      messages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP,
      frequency_penalty: settings.frequencyPenalty,
      presence_penalty: settings.presencePenalty,
      stream: true,
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

      if (maxTokens !== undefined && (maxTokens < 1 || maxTokens > 128000)) {
        throw new AIServiceError(
          'Max tokens must be between 1 and 128,000',
          AIErrorType.INVALID_REQUEST,
          400
        );
      }
    }
  }

  /**
   * Handle OpenAI API errors
   */
  private handleError(error: any): AIServiceError {
    // Handle OpenAI specific errors
    if (error instanceof OpenAI.APIError) {
      // Rate limit error
      if (error.status === 429) {
        return new AIServiceError(
          'Rate limit exceeded. Please try again later.',
          AIErrorType.RATE_LIMIT,
          429,
          error
        );
      }

      // Authentication error
      if (error.status === 401) {
        return new AIServiceError(
          'Invalid API key or authentication failed',
          AIErrorType.AUTHENTICATION,
          401,
          error
        );
      }

      // Insufficient quota
      if (error.status === 403) {
        return new AIServiceError(
          'Insufficient quota or permissions',
          AIErrorType.INSUFFICIENT_QUOTA,
          403,
          error
        );
      }

      // Invalid request
      if (error.status === 400) {
        return new AIServiceError(
          error.message || 'Invalid request to OpenAI API',
          AIErrorType.INVALID_REQUEST,
          400,
          error
        );
      }

      // Context length exceeded
      if (error.message?.includes('context_length_exceeded')) {
        return new AIServiceError(
          'Context is too large. Please reduce the amount of text.',
          AIErrorType.CONTEXT_TOO_LARGE,
          400,
          error
        );
      }

      // Generic API error
      return new AIServiceError(
        error.message || 'OpenAI API error',
        AIErrorType.API_ERROR,
        error.status,
        error
      );
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
   * Test the connection to OpenAI API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data
        .filter(model => model.id.includes('gpt'))
        .map(model => model.id);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Calculate cost estimate for a request (approximate)
   */
  estimateCost(request: AIRequest): number {
    const prompt = buildPrompt(request);
    const inputTokens = estimateTokenCount(prompt.system + prompt.user);
    const outputTokens = request.settings.maxTokens || DEFAULT_AI_SETTINGS.maxTokens;

    // Pricing (as of 2024, subject to change)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }, // per 1K tokens
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
    };

    const model = request.settings.model || DEFAULT_AI_SETTINGS.model;
    const modelPricing = pricing[model] || pricing['gpt-3.5-turbo'];

    const inputCost = (inputTokens / 1000) * modelPricing.input;
    const outputCost = (outputTokens / 1000) * modelPricing.output;

    return inputCost + outputCost;
  }
}

/**
 * Create and initialize OpenAI service
 */
export function createOpenAIService(
  apiKey: string,
  config?: Partial<AIServiceConfig>
): OpenAIService {
  if (!apiKey) {
    throw new AIServiceError(
      'OpenAI API key is required',
      AIErrorType.AUTHENTICATION,
      401
    );
  }

  return new OpenAIService({
    apiKey,
    ...config,
  });
}

/**
 * Singleton instance (optional, for convenience)
 */
let serviceInstance: OpenAIService | null = null;

/**
 * Get or create singleton OpenAI service instance
 */
export function getOpenAIService(apiKey?: string): OpenAIService {
  if (!serviceInstance) {
    if (!apiKey) {
      throw new AIServiceError(
        'OpenAI API key is required for first initialization',
        AIErrorType.AUTHENTICATION,
        401
      );
    }
    serviceInstance = createOpenAIService(apiKey);
  }
  return serviceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetOpenAIService(): void {
  serviceInstance = null;
}
