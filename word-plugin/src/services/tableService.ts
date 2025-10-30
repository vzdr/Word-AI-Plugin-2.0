/**
 * Table Service for AI Integration
 *
 * Provides AI-powered content generation for table cells
 * Handles single cell generation, batch operations, and context building
 * Integrates with existing aiService.ts for backend communication
 */

import { askAI, AIQueryResponse, AIServiceError, isAIServiceError } from './aiService';
import { SettingsValues } from '../taskpane/components/Settings';
import { CellInfo, TableStructure } from '../types/table';

/**
 * Context for a single cell
 * Used to build AI prompts with surrounding information
 */
export interface CellContext {
  /**
   * Row index of the cell
   */
  rowIndex: number;

  /**
   * Column index of the cell
   */
  colIndex: number;

  /**
   * Original content of the cell
   */
  originalContent?: string;

  /**
   * Column header text (horizontal header from top row)
   */
  columnHeader?: string;

  /**
   * Row header text (vertical header from left column)
   */
  rowHeader?: string;

  /**
   * Derived purpose of the cell based on headers
   * e.g., "Mass in December" from columnHeader="Mass" and rowHeader="December"
   */
  cellPurpose?: string;

  /**
   * Whether this cell is in a header row
   */
  isHeaderCell?: boolean;

  /**
   * Text from cells in the same row
   */
  rowContext: string[];

  /**
   * Text from cells in the same column
   */
  columnContext: string[];

  /**
   * Text from adjacent cells (left, right, top, bottom)
   */
  adjacentCells: {
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
  };
}

/**
 * Context for the entire table
 * Provides high-level information for AI generation
 */
export interface TableContext {
  /**
   * Total number of rows
   */
  rowCount: number;

  /**
   * Total number of columns
   */
  columnCount: number;

  /**
   * Column headers (if available)
   */
  headers?: string[];

  /**
   * Inferred table purpose or description
   */
  purpose?: string;

  /**
   * Sample data from filled cells (for pattern learning)
   */
  sampleData?: string[][];
}

/**
 * Request for generating content for a single cell
 */
export interface CellGenerationRequest {
  /**
   * Context for the specific cell
   */
  cellContext: CellContext;

  /**
   * Context for the entire table
   */
  tableContext: TableContext;

  /**
   * Additional user-provided context
   */
  userContext?: string;

  /**
   * AI model settings
   */
  settings: SettingsValues;
}

/**
 * Request for batch generation of multiple cells
 */
export interface BatchCellGenerationRequest {
  /**
   * Array of cell contexts to generate content for
   */
  cells: CellContext[];

  /**
   * Context for the entire table
   */
  tableContext: TableContext;

  /**
   * Additional user-provided context
   */
  userContext?: string;

  /**
   * AI model settings
   */
  settings: SettingsValues;

  /**
   * Maximum number of cells to process in a single batch
   * @default 10
   */
  batchSize?: number;
}

/**
 * Result of cell content generation
 */
export interface CellGenerationResult {
  /**
   * Whether generation was successful
   */
  success: boolean;

  /**
   * Generated content for the cell
   */
  content?: string;

  /**
   * Error message if generation failed
   */
  error?: string;

  /**
   * Row index of the cell
   */
  rowIndex?: number;

  /**
   * Column index of the cell
   */
  colIndex?: number;

  /**
   * Token usage information
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Result of batch cell generation
 */
export interface BatchCellGenerationResult {
  /**
   * Whether the overall batch was successful
   */
  success: boolean;

  /**
   * Results for each cell (in same order as input)
   */
  results: CellGenerationResult[];

  /**
   * Number of successfully generated cells
   */
  successCount: number;

  /**
   * Number of failed cells
   */
  failureCount: number;

  /**
   * Total token usage across all requests
   */
  totalUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /**
   * Overall error if batch completely failed
   */
  error?: string;
}

/**
 * Build an intelligent AI prompt based on cell context and header configuration
 *
 * Creates context-aware prompts that adapt to different header scenarios:
 * - Both headers: Uses combined purpose (e.g., "Mass in December")
 * - One header: Uses single header context
 * - No headers: Expects cell to contain self-describing question
 *
 * @param cellContext - Context for the specific cell
 * @param tableContext - Context for the entire table
 * @param userContext - Optional user-provided context
 * @returns Structured prompt for AI generation
 *
 * @internal
 */
function buildCellPrompt(
  cellContext: CellContext,
  tableContext: TableContext,
  userContext?: string
): { systemPrompt: string; userPrompt: string } {
  const { originalContent, cellPurpose, columnHeader, rowHeader, rowContext, adjacentCells } = cellContext;

  // Skip header cells - they should not be filled
  if (cellContext.isHeaderCell) {
    return {
      systemPrompt: 'You are a table cell content generator.',
      userPrompt: originalContent || '',
    };
  }

  // Build system prompt based on header configuration
  let systemPrompt = `You are an intelligent table cell content generator. Your task is to generate appropriate content for a table cell based on the provided context.

IMPORTANT RULES:
1. Return ONLY the cell content - no explanations, no preamble, no formatting
2. Keep responses concise and appropriate for a table cell
3. If the cell already contains content, analyze it:
   - If it's a mathematical expression ending with '=?', calculate and return the result
   - If it's a complete answer, return it unchanged
   - If it's a question or prompt, generate an appropriate answer
4. Use the provided context to generate relevant, accurate content
5. Do not use markdown, bullets, or multi-line responses unless absolutely necessary`;

  // Build user prompt based on header configuration
  let userPrompt = '';

  if (cellPurpose) {
    // We have headers - use the derived purpose
    userPrompt += `Cell Purpose: Generate content for "${cellPurpose}"\n\n`;

    if (columnHeader && rowHeader) {
      userPrompt += `Context:\n`;
      userPrompt += `- Column: ${columnHeader}\n`;
      userPrompt += `- Row: ${rowHeader}\n`;
    } else if (columnHeader) {
      userPrompt += `Column Header: ${columnHeader}\n`;
    } else if (rowHeader) {
      userPrompt += `Row Header: ${rowHeader}\n`;
    }

    // Add surrounding context
    if (adjacentCells.left) {
      userPrompt += `- Left cell: ${adjacentCells.left}\n`;
    }
    if (adjacentCells.top) {
      userPrompt += `- Above cell: ${adjacentCells.top}\n`;
    }

    // Add row context if available
    const nonEmptyRowContext = rowContext.filter(c => c && c.trim().length > 0);
    if (nonEmptyRowContext.length > 0) {
      userPrompt += `- Other cells in this row: ${nonEmptyRowContext.join(', ')}\n`;
    }
  } else {
    // No headers - cell content must be self-descriptive
    userPrompt += `Note: This table has no headers. The cell content should be self-describing.\n\n`;

    if (originalContent && originalContent.trim().length > 0) {
      userPrompt += `Cell Content: "${originalContent}"\n`;
      userPrompt += `Task: Analyze the cell content. If it's a question or prompt, provide an appropriate answer. If it's a mathematical expression ending with '=?', calculate and return only the numerical result.\n`;
    } else {
      userPrompt += `The cell is empty. Without headers or context, cannot generate content.\n`;
      userPrompt += `Please ensure cells in tables without headers contain clear questions or prompts.\n`;
    }
  }

  // Add user-provided context if available
  if (userContext && userContext.trim().length > 0) {
    userPrompt += `\nAdditional Context: ${userContext}\n`;
  }

  // Add the actual cell content to process
  if (originalContent && originalContent.trim().length > 0) {
    userPrompt += `\nCell Content to Process: "${originalContent}"\n`;
  }

  userPrompt += `\nGenerate the appropriate cell content now:`;

  return { systemPrompt, userPrompt };
}

/**
 * Generate content for a single table cell using AI
 *
 * Builds a context-aware prompt using cell position, headers, and adjacent cells
 * Adapts intelligently to different header configurations
 * Calls the AI service to generate appropriate content
 *
 * @param cellContext - Context for the specific cell
 * @param tableContext - Context for the entire table
 * @param settings - AI model settings
 * @param userContext - Optional additional context from user
 * @returns Generation result with content or error
 *
 * @example
 * ```typescript
 * const result = await generateCellContent(
 *   { rowIndex: 1, colIndex: 0, columnHeader: 'Name', rowContext: [], ... },
 *   { rowCount: 10, columnCount: 3, headers: ['Name', 'Age', 'City'] },
 *   { model: 'gpt-3.5-turbo', temperature: 0.7, maxTokens: 100 }
 * );
 * if (result.success) {
 *   console.log('Generated:', result.content);
 * }
 * ```
 */
export async function generateCellContent(
  cellContext: CellContext,
  tableContext: TableContext,
  settings: SettingsValues,
  userContext?: string
): Promise<CellGenerationResult> {
  try {
    // Skip if this is a header cell
    if (cellContext.isHeaderCell) {
      return {
        success: false,
        error: 'Cannot fill header cells',
        rowIndex: cellContext.rowIndex,
        colIndex: cellContext.colIndex,
      };
    }

    // Build intelligent prompt based on context
    const { systemPrompt, userPrompt } = buildCellPrompt(cellContext, tableContext, userContext);

    // Call AI service
    const response = await askAI(
      userPrompt,
      systemPrompt,
      [], // No files for table generation
      settings
    );

    return {
      success: true,
      content: response.response.trim(),
      rowIndex: cellContext.rowIndex,
      colIndex: cellContext.colIndex,
      usage: response.usage,
    };
  } catch (error) {
    console.error('Error generating cell content:', error);

    let errorMessage = 'Failed to generate cell content';
    if (isAIServiceError(error)) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
      rowIndex: cellContext.rowIndex,
      colIndex: cellContext.colIndex,
    };
  }
}

/**
 * Generate content for multiple cells in batch
 *
 * More efficient than calling generateCellContent multiple times
 * Processes cells in batches to handle rate limiting and optimize API calls
 *
 * @param cells - Array of cell contexts to generate content for
 * @param tableContext - Context for the entire table
 * @param settings - AI model settings
 * @param userContext - Optional additional context from user
 * @param batchSize - Maximum cells to process per batch (default: 10)
 * @returns Batch generation result with all cell results
 *
 * @example
 * ```typescript
 * const result = await generateBatchCellContent(
 *   [cellContext1, cellContext2, cellContext3],
 *   tableContext,
 *   settings,
 *   'Fill with sample data'
 * );
 * console.log(`Generated ${result.successCount}/${cells.length} cells`);
 * ```
 */
export async function generateBatchCellContent(
  cells: CellContext[],
  tableContext: TableContext,
  settings: SettingsValues,
  userContext?: string,
  batchSize: number = 10
): Promise<BatchCellGenerationResult> {
  const results: CellGenerationResult[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let successCount = 0;
  let failureCount = 0;

  try {
    // Process cells in batches to manage rate limiting
    for (let i = 0; i < cells.length; i += batchSize) {
      const batch = cells.slice(i, i + batchSize);

      // Process batch in parallel (within rate limits)
      const batchPromises = batch.map((cellContext) =>
        generateCellContent(cellContext, tableContext, settings, userContext)
      );

      const batchResults = await Promise.all(batchPromises);

      // Aggregate results
      for (const result of batchResults) {
        results.push(result);

        if (result.success) {
          successCount++;
          if (result.usage) {
            totalPromptTokens += result.usage.promptTokens;
            totalCompletionTokens += result.usage.completionTokens;
            totalTokens += result.usage.totalTokens;
          }
        } else {
          failureCount++;
        }
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < cells.length) {
        await delay(1000); // 1 second delay between batches
      }
    }

    return {
      success: true,
      results,
      successCount,
      failureCount,
      totalUsage:
        totalTokens > 0
          ? {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens,
            }
          : undefined,
    };
  } catch (error) {
    console.error('Error in batch cell generation:', error);

    return {
      success: false,
      results,
      successCount,
      failureCount,
      error: error instanceof Error ? error.message : 'Batch generation failed',
      totalUsage:
        totalTokens > 0
          ? {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens,
            }
          : undefined,
    };
  }
}



/**
 * Delay helper for rate limiting between batches
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 *
 * @internal
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Infer table purpose from structure and content
 *
 * Analyzes headers and sample data to determine what the table represents
 * Used to provide better context for AI generation
 *
 * @param tableStructure - Complete table structure with cells
 * @returns Inferred purpose description
 *
 * @example
 * ```typescript
 * const purpose = inferTablePurpose(tableStructure);
 * // Returns: "Employee directory with names, roles, and contact information"
 * ```
 */
export function inferTablePurpose(tableStructure: TableStructure): string {
  const { headers, cells } = tableStructure;

  // If we have headers, use them to infer purpose
  if (headers && headers.length > 0) {
    const headerText = headers.join(', ');
    return `Table with columns: ${headerText}`;
  }

  // If no headers, try to infer from first row
  if (cells.length > 0 && cells[0].length > 0) {
    const firstRowText = cells[0]
      .map((cell) => cell.text)
      .filter((text) => text.trim().length > 0)
      .join(', ');

    if (firstRowText.length > 0) {
      return `Table with data including: ${firstRowText}`;
    }
  }

  return 'Data table';
}

/**
 * Extract sample data from table for context
 *
 * Gets a sample of filled cells to help AI understand patterns
 * Prioritizes rows with most filled cells
 *
 * @param tableStructure - Complete table structure
 * @param maxSamples - Maximum number of sample rows (default: 3)
 * @returns Array of sample rows (each row is array of cell texts)
 *
 * @example
 * ```typescript
 * const samples = extractSampleData(tableStructure, 2);
 * // Returns: [["John", "30", "NYC"], ["Jane", "25", "LA"]]
 * ```
 */
export function extractSampleData(
  tableStructure: TableStructure,
  maxSamples: number = 3
): string[][] {
  const { cells, info } = tableStructure;

  // Skip header row if present
  const startRow = info.hasHeaders ? 1 : 0;
  const sampleData: string[][] = [];

  // Get rows with most filled cells
  const rowScores = cells.slice(startRow).map((row, idx) => {
    const filledCells = row.filter((cell) => !cell.isEmpty).length;
    return { index: idx + startRow, score: filledCells };
  });

  // Sort by score descending
  rowScores.sort((a, b) => b.score - a.score);

  // Take top rows
  const topRows = rowScores.slice(0, maxSamples);

  for (const { index } of topRows) {
    const row = cells[index];
    const rowData = row.map((cell) => cell.text || '');
    sampleData.push(rowData);
  }

  return sampleData;
}
