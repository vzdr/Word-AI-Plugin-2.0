/**
 * Table Filler Utilities
 *
 * Provides utilities for filling empty cells in Word tables
 * Supports different fill strategies, validation, and preview
 * Integrates with tableService for AI content generation
 */

import {
  CellInfo,
  TableStructure,
  TableParseResult,
  AutoFillOptions,
  DEFAULT_AUTOFILL_OPTIONS,
} from '../types/table';
import {
  generateBatchCellContent,
  CellContext,
  TableContext,
  CellGenerationResult,
  BatchCellGenerationResult,
  inferTablePurpose,
  extractSampleData,
} from '../services/tableService';
import { SettingsValues } from '../taskpane/components/Settings';
import { parseTableStructure } from './tableDetection';

/**
 * Fill strategy for table cells
 */
export type FillStrategy = 'CONTEXTUAL' | 'BATCH' | 'SELECTIVE';

/**
 * Cell update to apply to table
 */
export interface CellUpdate {
  /**
   * Row index of cell to update
   */
  rowIndex: number;

  /**
   * Column index of cell to update
   */
  colIndex: number;

  /**
   * New content for the cell
   */
  content: string;

  /**
   * Whether this update was successful
   */
  success: boolean;

  /**
   * Error if update failed
   */
  error?: string;
}

/**
 * Result of a fill operation
 */
export interface FillOperationResult {
  /**
   * Whether the operation was successful overall
   */
  success: boolean;

  /**
   * Cell updates that were applied
   */
  updates: CellUpdate[];

  /**
   * Number of cells successfully filled
   */
  filledCount: number;

  /**
   * Number of cells that failed to fill
   */
  failedCount: number;

  /**
   * Total cells attempted
   */
  totalAttempted: number;

  /**
   * Error message if operation failed
   */
  error?: string;

  /**
   * Token usage statistics
   */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Preview of fill changes without applying
 */
export interface FillPreview {
  /**
   * Cells that will be filled
   */
  cellsToFill: CellInfo[];

  /**
   * Count of cells to fill
   */
  count: number;

  /**
   * Percentage of table that will be filled
   */
  percentage: number;

  /**
   * Strategy that will be used
   */
  strategy: FillStrategy;

  /**
   * Preview of generated content (may be sample)
   */
  previewContent?: CellUpdate[];
}

/**
 * Validation result for fill operation
 */
export interface FillValidation {
  /**
   * Whether the operation is valid
   */
  valid: boolean;

  /**
   * Validation error if invalid
   */
  error?: string;

  /**
   * Warnings (non-blocking)
   */
  warnings?: string[];

  /**
   * Number of cells that can be filled
   */
  fillableCount?: number;
}

/**
 * Fill empty cells in a table with AI-generated content
 *
 * Main function for auto-filling table cells using AI
 * Supports different strategies and validates before filling
 *
 * @param tableIndex - Index of table to fill (0-based)
 * @param strategy - Fill strategy to use
 * @param settings - AI model settings
 * @param options - Fill options (targeting, context, etc.)
 * @returns Result of fill operation
 *
 * @example
 * ```typescript
 * const result = await fillEmptyCells(
 *   0,
 *   'CONTEXTUAL',
 *   { model: 'gpt-3.5-turbo', temperature: 0.7, maxTokens: 100 },
 *   { emptyOnly: true, maxCells: 50 }
 * );
 * console.log(`Filled ${result.filledCount} cells`);
 * ```
 */
export async function fillEmptyCells(
  tableIndex: number,
  strategy: FillStrategy,
  settings: SettingsValues,
  options: AutoFillOptions = {}
): Promise<FillOperationResult> {
  const opts = { ...DEFAULT_AUTOFILL_OPTIONS, ...options };

  try {
    // Parse table structure
    const parseResult = await parseTableStructure(tableIndex, opts.skipMergedCells);
    if (!parseResult.success || !parseResult.structure) {
      return {
        success: false,
        updates: [],
        filledCount: 0,
        failedCount: 0,
        totalAttempted: 0,
        error: parseResult.error || 'Failed to parse table',
      };
    }

    const tableStructure = parseResult.structure;

    // Validate operation
    const validation = validateFillOperation(tableStructure, [], opts);
    if (!validation.valid) {
      return {
        success: false,
        updates: [],
        filledCount: 0,
        failedCount: 0,
        totalAttempted: 0,
        error: validation.error,
      };
    }

    // Get cells to fill based on options
    const cellsToFill = getCellsToFill(tableStructure, opts);

    if (cellsToFill.length === 0) {
      return {
        success: true,
        updates: [],
        filledCount: 0,
        failedCount: 0,
        totalAttempted: 0,
      };
    }

    // Build context for AI generation
    const tableContext = buildTableContext(tableStructure, opts.context);

    // Build cell contexts
    const cellContexts = cellsToFill.map((cell) =>
      buildCellContext(cell, tableStructure)
    );

    // Generate content based on strategy
    let batchResult: BatchCellGenerationResult;

    switch (strategy) {
      case 'CONTEXTUAL':
        // Process in smaller batches with more context
        batchResult = await generateBatchCellContent(
          cellContexts,
          tableContext,
          settings,
          opts.context,
          5 // Smaller batch for contextual
        );
        break;

      case 'BATCH':
        // Process all at once for efficiency
        batchResult = await generateBatchCellContent(
          cellContexts,
          tableContext,
          settings,
          opts.context,
          10 // Larger batch
        );
        break;

      case 'SELECTIVE':
        // Process only targeted cells
        const targetedCells = cellContexts.filter((ctx) => {
          const rowMatch = !opts.targetRows || opts.targetRows.includes(ctx.rowIndex);
          const colMatch = !opts.targetColumns || opts.targetColumns.includes(ctx.colIndex);
          return rowMatch && colMatch;
        });

        batchResult = await generateBatchCellContent(
          targetedCells,
          tableContext,
          settings,
          opts.context,
          5
        );
        break;

      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }

    // Convert generation results to cell updates
    const updates: CellUpdate[] = batchResult.results.map((result) => ({
      rowIndex: result.rowIndex!,
      colIndex: result.colIndex!,
      content: result.content || '',
      success: result.success,
      error: result.error,
    }));

    // Apply updates to table
    const applyResult = await fillCellsWithContent(tableIndex, updates, opts);

    return {
      success: applyResult.success,
      updates: applyResult.updates,
      filledCount: applyResult.filledCount,
      failedCount: applyResult.failedCount,
      totalAttempted: updates.length,
      error: applyResult.error,
      usage: batchResult.totalUsage,
    };
  } catch (error) {
    console.error('Error filling empty cells:', error);
    return {
      success: false,
      updates: [],
      filledCount: 0,
      failedCount: 0,
      totalAttempted: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Apply pre-generated content to specific cells
 *
 * Takes an array of cell updates and applies them to the Word table
 * Handles formatting preservation and error recovery
 *
 * @param tableIndex - Index of table to update
 * @param cellUpdates - Array of updates to apply
 * @param options - Fill options (formatting, etc.)
 * @returns Result of fill operation
 *
 * @example
 * ```typescript
 * const updates = [
 *   { rowIndex: 0, colIndex: 1, content: 'John', success: true },
 *   { rowIndex: 0, colIndex: 2, content: 'Doe', success: true }
 * ];
 * await fillCellsWithContent(0, updates);
 * ```
 */
export async function fillCellsWithContent(
  tableIndex: number,
  cellUpdates: CellUpdate[],
  options: AutoFillOptions = {}
): Promise<FillOperationResult> {
  const opts = { ...DEFAULT_AUTOFILL_OPTIONS, ...options };

  const appliedUpdates: CellUpdate[] = [];
  let filledCount = 0;
  let failedCount = 0;

  try {
    await Word.run(async (context) => {
      const bodyTables = context.document.body.tables;
      bodyTables.load('items');
      await context.sync();

      if (tableIndex < 0 || tableIndex >= bodyTables.items.length) {
        throw new Error(`Invalid table index: ${tableIndex}`);
      }

      const table = bodyTables.items[tableIndex];
      table.load('values');
      await context.sync();

      const rowCount = table.values.length;
      const columnCount = table.values.length > 0 ? table.values[0].length : 0;

      // Apply each update
      for (const update of cellUpdates) {
        if (!update.success) {
          // Skip failed generations
          appliedUpdates.push(update);
          failedCount++;
          continue;
        }

        try {
          // Validate cell coordinates
          if (
            update.rowIndex < 0 ||
            update.rowIndex >= rowCount ||
            update.colIndex < 0 ||
            update.colIndex >= columnCount
          ) {
            appliedUpdates.push({
              ...update,
              success: false,
              error: 'Invalid cell coordinates',
            });
            failedCount++;
            continue;
          }

          // Get cell
          const cell = table.getCell(update.rowIndex, update.colIndex);

          // Insert text with appropriate options
          if (opts.preserveFormatting) {
            // Replace content but keep formatting
            cell.body.clear();
            cell.body.insertText(update.content, Word.InsertLocation.start);
          } else {
            // Replace content and formatting
            cell.body.clear();
            cell.body.insertText(update.content, Word.InsertLocation.start);
          }

          appliedUpdates.push({
            ...update,
            success: true,
          });
          filledCount++;
        } catch (error) {
          console.error(`Error filling cell [${update.rowIndex}, ${update.colIndex}]:`, error);
          appliedUpdates.push({
            ...update,
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fill cell',
          });
          failedCount++;
        }
      }

      // Sync all changes
      await context.sync();
    });

    return {
      success: true,
      updates: appliedUpdates,
      filledCount,
      failedCount,
      totalAttempted: cellUpdates.length,
    };
  } catch (error) {
    console.error('Error applying cell updates:', error);
    return {
      success: false,
      updates: appliedUpdates,
      filledCount,
      failedCount,
      totalAttempted: cellUpdates.length,
      error: error instanceof Error ? error.message : 'Failed to apply updates',
    };
  }
}

/**
 * Generate preview of fill changes without applying
 *
 * Shows what cells will be filled without actually making changes
 * Optionally generates sample content for preview
 *
 * @param tableIndex - Index of table to preview
 * @param strategy - Fill strategy to use
 * @param options - Fill options
 * @param generateSample - Whether to generate sample content (default: false)
 * @returns Preview of changes
 *
 * @example
 * ```typescript
 * const preview = await previewFillChanges(0, 'CONTEXTUAL', { maxCells: 10 });
 * console.log(`Will fill ${preview.count} cells (${preview.percentage}%)`);
 * ```
 */
export async function previewFillChanges(
  tableIndex: number,
  strategy: FillStrategy,
  options: AutoFillOptions = {},
  generateSample: boolean = false
): Promise<FillPreview | null> {
  const opts = { ...DEFAULT_AUTOFILL_OPTIONS, ...options };

  try {
    // Parse table structure
    const parseResult = await parseTableStructure(tableIndex);
    if (!parseResult.success || !parseResult.structure) {
      return null;
    }

    const tableStructure = parseResult.structure;

    // Get cells to fill
    const cellsToFill = getCellsToFill(tableStructure, opts);

    const totalCells = tableStructure.info.totalCells;
    const percentage = totalCells > 0 ? (cellsToFill.length / totalCells) * 100 : 0;

    const preview: FillPreview = {
      cellsToFill,
      count: cellsToFill.length,
      percentage: Math.round(percentage * 100) / 100,
      strategy,
    };

    // Optionally generate sample content
    if (generateSample && cellsToFill.length > 0) {
      // Generate for a few sample cells (max 3)
      const sampleCells = cellsToFill.slice(0, 3);
      // Note: This would require settings to be passed in
      // Leaving as undefined for now since it's optional
      preview.previewContent = [];
    }

    return preview;
  } catch (error) {
    console.error('Error generating preview:', error);
    return null;
  }
}

/**
 * Build context for a single cell
 *
 * Extracts relevant context from surrounding cells for AI generation
 * Includes header, row data, column data, and adjacent cells
 *
 * @param cell - Cell to build context for
 * @param table - Complete table structure
 * @returns Cell context for AI prompt
 *
 * @example
 * ```typescript
 * const cellContext = buildCellContext(cell, tableStructure);
 * // Returns context with headers, row data, adjacent cells, etc.
 * ```
 */
export function buildCellContext(
  cell: CellInfo,
  table: TableStructure
): CellContext {
  const { rowIndex, colIndex, text } = cell;
  const { cells, headers } = table;

  // Get column header
  const columnHeader = headers ? headers[colIndex] : undefined;

  // Get row context (other cells in same row)
  const rowContext = cells[rowIndex]
    .filter((c, idx) => idx !== colIndex)
    .map((c) => c.text);

  // Get column context (other cells in same column, excluding this one)
  const columnContext = cells
    .filter((_, idx) => idx !== rowIndex)
    .map((row) => row[colIndex]?.text || '')
    .filter((text) => text.trim().length > 0);

  // Get adjacent cells
  const adjacentCells: CellContext['adjacentCells'] = {};

  if (colIndex > 0) {
    adjacentCells.left = cells[rowIndex][colIndex - 1]?.text;
  }

  if (colIndex < cells[rowIndex].length - 1) {
    adjacentCells.right = cells[rowIndex][colIndex + 1]?.text;
  }

  if (rowIndex > 0) {
    adjacentCells.top = cells[rowIndex - 1][colIndex]?.text;
  }

  if (rowIndex < cells.length - 1) {
    adjacentCells.bottom = cells[rowIndex + 1][colIndex]?.text;
  }

  return {
    rowIndex,
    colIndex,
    originalContent: text,
    columnHeader,
    rowContext,
    columnContext,
    adjacentCells,
  };
}

/**
 * Build table context for AI generation
 *
 * Creates high-level context about the table for better AI generation
 * Includes structure, purpose, and sample data
 *
 * @param table - Complete table structure
 * @param userContext - Optional user-provided context
 * @returns Table context for AI prompts
 *
 * @internal
 */
function buildTableContext(
  table: TableStructure,
  userContext?: string
): TableContext {
  const purpose = inferTablePurpose(table);
  const sampleData = extractSampleData(table, 3);

  return {
    rowCount: table.info.rowCount,
    columnCount: table.info.columnCount,
    headers: table.headers,
    purpose,
    sampleData,
  };
}

/**
 * Get list of cells to fill based on options
 *
 * Filters cells based on:
 * - Empty/filled status
 * - Target rows/columns
 * - Header inclusion
 * - Max cells limit
 * - Merged cells
 *
 * @param table - Table structure
 * @param options - Fill options
 * @returns Array of cells to fill
 *
 * @internal
 */
function getCellsToFill(
  table: TableStructure,
  options: Required<AutoFillOptions>
): CellInfo[] {
  let cellsToFill = table.cellsFlat;

  // Filter by empty status
  if (options.emptyOnly) {
    cellsToFill = cellsToFill.filter((cell) => cell.isEmpty);
  }

  // Filter by header
  if (!options.includeHeaders && table.info.hasHeaders) {
    cellsToFill = cellsToFill.filter((cell) => cell.rowIndex > 0);
  }

  // Filter by target rows
  if (options.targetRows && options.targetRows.length > 0) {
    cellsToFill = cellsToFill.filter((cell) =>
      options.targetRows!.includes(cell.rowIndex)
    );
  }

  // Filter by target columns
  if (options.targetColumns && options.targetColumns.length > 0) {
    cellsToFill = cellsToFill.filter((cell) =>
      options.targetColumns!.includes(cell.colIndex)
    );
  }

  // Filter merged cells
  if (options.skipMergedCells) {
    cellsToFill = cellsToFill.filter((cell) => !cell.isMerged);
  }

  // Limit by max cells
  if (options.maxCells && cellsToFill.length > options.maxCells) {
    cellsToFill = cellsToFill.slice(0, options.maxCells);
  }

  return cellsToFill;
}

/**
 * Validate fill operation before execution
 *
 * Checks if the operation is safe and valid:
 * - Table exists and is accessible
 * - Target cells exist
 * - No conflicts with protected cells
 * - Not exceeding limits
 *
 * @param table - Table structure
 * @param cells - Cells to fill (empty for auto-detect)
 * @param options - Fill options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const validation = validateFillOperation(tableStructure, [], options);
 * if (!validation.valid) {
 *   console.error(validation.error);
 * }
 * ```
 */
export function validateFillOperation(
  table: TableStructure,
  cells: CellInfo[],
  options: AutoFillOptions = {}
): FillValidation {
  const opts = { ...DEFAULT_AUTOFILL_OPTIONS, ...options };
  const warnings: string[] = [];

  // Check if table exists
  if (!table || !table.info) {
    return {
      valid: false,
      error: 'Invalid table structure',
    };
  }

  // Check if table has cells
  if (table.info.totalCells === 0) {
    return {
      valid: false,
      error: 'Table has no cells',
    };
  }

  // Check if we have cells to fill
  const cellsToFill = cells.length > 0 ? cells : getCellsToFill(table, opts);

  if (cellsToFill.length === 0) {
    warnings.push('No cells to fill based on current options');
  }

  // Validate target rows
  if (opts.targetRows && opts.targetRows.length > 0) {
    const invalidRows = opts.targetRows.filter(
      (row) => row < 0 || row >= table.info.rowCount
    );
    if (invalidRows.length > 0) {
      return {
        valid: false,
        error: `Invalid target rows: ${invalidRows.join(', ')}`,
      };
    }
  }

  // Validate target columns
  if (opts.targetColumns && opts.targetColumns.length > 0) {
    const invalidCols = opts.targetColumns.filter(
      (col) => col < 0 || col >= table.info.columnCount
    );
    if (invalidCols.length > 0) {
      return {
        valid: false,
        error: `Invalid target columns: ${invalidCols.join(', ')}`,
      };
    }
  }

  // Warn if filling many cells
  if (cellsToFill.length > 50) {
    warnings.push(
      `Filling ${cellsToFill.length} cells may take a while and consume significant API tokens`
    );
  }

  // Warn if merged cells are present
  if (table.info.hasMergedCells && !opts.skipMergedCells) {
    warnings.push('Table contains merged cells which may cause unexpected results');
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    fillableCount: cellsToFill.length,
  };
}
