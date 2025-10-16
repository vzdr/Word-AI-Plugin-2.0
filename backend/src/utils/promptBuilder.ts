/**
 * Prompt Builder Utility for Word AI Plugin Backend
 *
 * Handles construction of prompts for AI requests with context injection
 * and source attribution
 */

import { AIRequest, PromptTemplate, Source } from '../types/ai';

/**
 * Default system prompt template
 */
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant analyzing documents and answering questions based on provided context.

Your task is to:
1. Carefully read and understand the provided context
2. Answer the user's question based on the context
3. Cite specific sources when making claims
4. Be concise and accurate
5. If the answer is not in the context, clearly state that

Guidelines:
- Always prioritize accuracy over speculation
- When citing sources, reference them as [Source: filename]
- If multiple sources support your answer, cite all of them
- Maintain a professional and helpful tone
- Format your response clearly and readably`;

const NO_CONTEXT_SYSTEM_PROMPT = `You are a helpful AI assistant. Please answer the user's question accurately and concisely.`;

/**
 * Build a complete prompt from an AI request
 */
export function buildPrompt(request: AIRequest): PromptTemplate {
  const { question, contextFiles, inlineContext } = request;

  if (inlineContext && inlineContext.includes('You are a table cell processor')) {
    return {
      system: inlineContext,
      user: question,
    };
  }

  // Build the context section
  const contextSection = buildContextSection(contextFiles, inlineContext);

  // Check if there is any meaningful context
  const hasContext = contextSection.trim().length > 0 && !contextSection.includes('NO CONTEXT PROVIDED');

  // Choose system prompt based on context
  const systemPrompt = hasContext ? DEFAULT_SYSTEM_PROMPT : NO_CONTEXT_SYSTEM_PROMPT;

  // Build the user message
  const userMessage = hasContext
    ? `${contextSection}\n\nUser Question: ${question}\n\nPlease provide a comprehensive answer based on the context provided above. Remember to cite your sources.`
    : `User Question: ${question}`;

  return {
    system: systemPrompt,
    user: userMessage,
  };
}

/**
 * Build the context section of the prompt
 */
function buildContextSection(
  contextFiles: string[],
  inlineContext: string
): string {
  const sections: string[] = [];

  // Add file contexts
  if (contextFiles && contextFiles.length > 0) {
    sections.push('=== CONTEXT FROM UPLOADED FILES ===\n');
    contextFiles.forEach((content, index) => {
      sections.push(`--- File ${index + 1} ---`);
      sections.push(content);
      sections.push('');
    });
  }

  // Add inline context
  if (inlineContext && inlineContext.trim()) {
    sections.push('=== ADDITIONAL CONTEXT ===');
    sections.push(inlineContext);
    sections.push('');
  }

  // If no context provided
  if (sections.length === 0) {
    sections.push('=== NO CONTEXT PROVIDED ===');
    sections.push('Please answer based on your general knowledge.');
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Build a prompt with custom system message
 */
export function buildCustomPrompt(
  request: AIRequest,
  systemPrompt: string
): PromptTemplate {
  const { question, contextFiles, inlineContext } = request;
  const contextSection = buildContextSection(contextFiles, inlineContext);

  const userMessage = `${contextSection}

User Question: ${question}`;

  return {
    system: systemPrompt,
    user: userMessage,
  };
}

/**
 * Extract sources from AI response text
 * Looks for [Source: filename] patterns in the response
 */
export function extractSources(
  responseText: string,
  contextFiles: string[]
): Source[] {
  const sources: Source[] = [];
  const sourcePattern = /\[Source:\s*([^\]]+)\]/gi;
  const matches = responseText.matchAll(sourcePattern);

  for (const match of matches) {
    const sourceRef = match[1].trim();

    // Try to find matching context file
    const matchingFile = findMatchingFile(sourceRef, contextFiles);

    if (matchingFile) {
      // Extract relevant chunk from the matching file
      const chunk = extractRelevantChunk(matchingFile, responseText);

      sources.push({
        file: sourceRef,
        chunk: chunk,
      });
    }
  }

  // If no explicit sources found but context was provided, create generic sources
  if (sources.length === 0 && contextFiles.length > 0) {
    contextFiles.forEach((content, index) => {
      sources.push({
        file: `File ${index + 1}`,
        chunk: truncateText(content, 200),
      });
    });
  }

  return sources;
}

/**
 * Find a matching file from context files based on source reference
 */
function findMatchingFile(
  sourceRef: string,
  contextFiles: string[]
): string | null {
  // Try exact match with file index pattern
  const indexMatch = sourceRef.match(/File\s+(\d+)/i);
  if (indexMatch) {
    const index = parseInt(indexMatch[1], 10) - 1;
    if (index >= 0 && index < contextFiles.length) {
      return contextFiles[index];
    }
  }

  // Try fuzzy matching with file content
  for (const file of contextFiles) {
    if (file.toLowerCase().includes(sourceRef.toLowerCase())) {
      return file;
    }
  }

  return contextFiles[0] || null;
}

/**
 * Extract a relevant chunk from a file based on response content
 */
function extractRelevantChunk(file: string, response: string): string {
  // Simple heuristic: extract first few sentences that might be relevant
  const sentences = file.split(/[.!?]+/).filter(s => s.trim());

  if (sentences.length === 0) {
    return truncateText(file, 200);
  }

  // Look for sentences that appear in both the file and response
  const responseLower = response.toLowerCase();
  const relevantSentences = sentences.filter(sentence => {
    const sentenceLower = sentence.toLowerCase().trim();
    return sentenceLower.length > 20 && responseLower.includes(sentenceLower.substring(0, 50));
  });

  if (relevantSentences.length > 0) {
    return truncateText(relevantSentences[0].trim(), 200);
  }

  // Fallback: return first meaningful sentence
  return truncateText(sentences[0].trim(), 200);
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate approximate token count for a text
 * Uses a simple heuristic: ~4 characters per token
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Validate that the prompt doesn't exceed token limits
 */
export function validatePromptLength(
  prompt: PromptTemplate,
  maxTokens: number
): { valid: boolean; estimatedTokens: number; error?: string } {
  const systemTokens = estimateTokenCount(prompt.system);
  const userTokens = estimateTokenCount(prompt.user);
  const estimatedTokens = systemTokens + userTokens;

  if (estimatedTokens > maxTokens) {
    return {
      valid: false,
      estimatedTokens,
      error: `Prompt exceeds maximum token limit. Estimated: ${estimatedTokens}, Max: ${maxTokens}`,
    };
  }

  return {
    valid: true,
    estimatedTokens,
  };
}

/**
 * Truncate context files to fit within token limits
 */
export function truncateContextToFit(
  contextFiles: string[],
  inlineContext: string,
  maxTokens: number,
  systemPromptTokens: number
): { contextFiles: string[]; inlineContext: string } {
  const availableTokens = maxTokens - systemPromptTokens - 500; // Reserve 500 for question and formatting

  if (availableTokens <= 0) {
    return { contextFiles: [], inlineContext: '' };
  }

  const inlineTokens = estimateTokenCount(inlineContext);
  let remainingTokens = availableTokens - inlineTokens;

  // If inline context already exceeds limit, truncate it
  if (remainingTokens < 0) {
    const truncatedInline = truncateText(
      inlineContext,
      availableTokens * 4 // Convert tokens back to characters
    );
    return { contextFiles: [], inlineContext: truncatedInline };
  }

  // Truncate context files to fit remaining tokens
  const truncatedFiles: string[] = [];
  const tokensPerFile = Math.floor(remainingTokens / Math.max(contextFiles.length, 1));

  for (const file of contextFiles) {
    const fileTokens = estimateTokenCount(file);
    if (fileTokens <= tokensPerFile) {
      truncatedFiles.push(file);
    } else {
      const truncated = truncateText(file, tokensPerFile * 4);
      truncatedFiles.push(truncated);
    }
  }

  return { contextFiles: truncatedFiles, inlineContext };
}

/**
 * Format sources for inclusion in response
 */
export function formatSources(sources: Source[]): string {
  if (sources.length === 0) {
    return '';
  }

  const formatted = sources.map((source, index) => {
    return `${index + 1}. ${source.file}\n   "${source.chunk}"`;
  });

  return '\n\nSources:\n' + formatted.join('\n');
}

/**
 * Build a prompt optimized for table auto-fill
 */
export function buildTablePrompt(
  request: AIRequest,
  tableStructure: string
): PromptTemplate {
  const { question, contextFiles, inlineContext } = request;
  const contextSection = buildContextSection(contextFiles, inlineContext);

  const systemPrompt = `You are an AI assistant specialized in filling tables with accurate information based on provided context.

Your task is to:
1. Analyze the table structure provided
2. Extract relevant information from the context
3. Fill each cell with accurate, concise data
4. Use "N/A" for cells where information is not available
5. Maintain consistent formatting

Guidelines:
- Be precise and factual
- Keep cell content concise
- Use appropriate data types (numbers, dates, text)
- Cite sources for important claims`;

  const userMessage = `${contextSection}

Table Structure:
${tableStructure}

Task: ${question}

Please fill the table with accurate information from the context. Return the completed table in the same format.`;

  return {
    system: systemPrompt,
    user: userMessage,
  };
}

/**
 * Clean and normalize AI response text
 */
export function cleanResponse(responseText: string): string {
  // Remove excessive whitespace
  let cleaned = responseText.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');

  return cleaned;
}
