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
   * Column header text (if table has headers)
   */
  columnHeader?: string;

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
 * Generate content for a single table cell using AI
 *
 * Builds a context-aware prompt using cell position, headers, and adjacent cells
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
    // Build the AI prompt with full context
    const prompt = buildCellPrompt(cellContext, tableContext, userContext);

    // Use a placeholder for selectedText (required by askAI)
    const selectedText = `Generate content for cell at row ${cellContext.rowIndex + 1}, column ${cellContext.colIndex + 1}`;

    // Call AI service
    const response = await askAI(
      selectedText,
      prompt,
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
 * Build AI prompt for cell content generation
 *
 * Creates a context-rich prompt using:
 * - Column header (what type of data)
 * - Row context (other cells in same row)
 * - Adjacent cells (immediate neighbors)
 * - Table purpose (inferred from structure)
 *
 * @param cellContext - Context for the specific cell
 * @param tableContext - Context for the entire table
 * @param userContext - Optional user-provided context
 * @returns Formatted prompt string for AI
 *
 * @internal
 */
function buildCellPrompt(
  cellContext: CellContext,
  tableContext: TableContext,
  userContext?: string
): string {
  const parts: string[] = [];

  // Add user context if provided
  if (userContext) {
    parts.push(`Context: ${userContext}`);
    parts.push('');
  }

  // Add table structure info
  parts.push(`Table Structure: ${tableContext.rowCount} rows x ${tableContext.columnCount} columns`);

  // Add table purpose if available
  if (tableContext.purpose) {
    parts.push(`Table Purpose: ${tableContext.purpose}`);
  }

  parts.push('');

  // Add cell position
  parts.push(
    `Generate content for cell at Row ${cellContext.rowIndex + 1}, Column ${cellContext.colIndex + 1}`
  );

  // Add column header if available
  if (cellContext.columnHeader) {
    parts.push(`Column: ${cellContext.columnHeader}`);
  }

  parts.push('');

  // Add row context (other cells in the same row)
  if (cellContext.rowContext.length > 0) {
    const nonEmptyRowContext = cellContext.rowContext.filter((text) => text.trim().length > 0);
    if (nonEmptyRowContext.length > 0) {
      parts.push('Other cells in this row:');
      nonEmptyRowContext.forEach((text, idx) => {
        parts.push(`  - ${text}`);
      });
      parts.push('');
    }
  }

  // Add adjacent cells for immediate context
  const adjacentParts: string[] = [];
  if (cellContext.adjacentCells.left) {
    adjacentParts.push(`Left: "${cellContext.adjacentCells.left}"`);
  }
  if (cellContext.adjacentCells.right) {
    adjacentParts.push(`Right: "${cellContext.adjacentCells.right}"`);
  }
  if (cellContext.adjacentCells.top) {
    adjacentParts.push(`Above: "${cellContext.adjacentCells.top}"`);
  }
  if (cellContext.adjacentCells.bottom) {
    adjacentParts.push(`Below: "${cellContext.adjacentCells.bottom}"`);
  }

  if (adjacentParts.length > 0) {
    parts.push('Adjacent cells:');
    adjacentParts.forEach((part) => parts.push(`  - ${part}`));
    parts.push('');
  }

  // Add column context (sample of other cells in same column)
  if (cellContext.columnContext.length > 0) {
    const nonEmptyColumnContext = cellContext.columnContext
      .filter((text) => text.trim().length > 0)
      .slice(0, 3); // Limit to 3 examples

    if (nonEmptyColumnContext.length > 0) {
      parts.push('Examples from this column:');
      nonEmptyColumnContext.forEach((text) => {
        parts.push(`  - ${text}`);
      });
      parts.push('');
    }
  }

  // Add sample data if available
  if (tableContext.sampleData && tableContext.sampleData.length > 0) {
    parts.push('Sample data from table:');
    tableContext.sampleData.slice(0, 2).forEach((row, idx) => {
      parts.push(`  Row ${idx + 1}: ${row.join(' | ')}`);
    });
    parts.push('');
  }

  // Add instruction
  parts.push(
    'Generate appropriate content for this cell based on the context above. ' +
      'Return ONLY the cell content, without any additional explanation or formatting.'
  );

  return parts.join('\n');
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
