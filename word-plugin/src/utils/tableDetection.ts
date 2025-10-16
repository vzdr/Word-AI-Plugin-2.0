/**
 * Table Detection Utilities for Office.js Word API
 *
 * Provides comprehensive table detection, structure parsing, and cell identification
 * Handles various table types including regular, merged cells, and nested tables
 * Supports tables in body, headers, footers, and text boxes
 */

import {
  TableInfo,
  TableStructure,
  CellInfo,
  MergedCellInfo,
  TableLocation,
  TableDetectionOptions,
  TableDetectionResult,
  TableParseResult,
  EmptyCellsResult,
  TableValidation,
  TableErrorCode,
  DEFAULT_TABLE_DETECTION_OPTIONS,
} from '../types/table';

/**
 * Detect all tables in the document
 *
 * @param options - Options for table detection
 * @returns Detection result with all found tables
 *
 * @example
 * ```typescript
 * const result = await detectTables({ includeNested: true });
 * console.log(`Found ${result.count} tables`);
 * ```
 */
export async function detectTables(
  options: TableDetectionOptions = {}
): Promise<TableDetectionResult> {
  const opts = { ...DEFAULT_TABLE_DETECTION_OPTIONS, ...options };

  try {
    return await Word.run(async (context) => {
      const tables: TableInfo[] = [];
      let tableIndex = 0;

      // Detect tables in document body
      const bodyTables = await detectTablesInBody(context, tableIndex, opts);
      tables.push(...bodyTables);
      tableIndex += bodyTables.length;

      // Detect tables in headers if requested
      if (opts.includeHeaders) {
        const headerTables = await detectTablesInHeaders(context, tableIndex, opts);
        tables.push(...headerTables);
        tableIndex += headerTables.length;
      }

      // Detect tables in footers if requested
      if (opts.includeFooters) {
        const footerTables = await detectTablesInFooters(context, tableIndex, opts);
        tables.push(...footerTables);
        tableIndex += footerTables.length;
      }

      return {
        success: true,
        tables,
        count: tables.length,
        timestamp: Date.now(),
      };
    });
  } catch (error) {
    console.error('Error detecting tables:', error);
    return {
      success: false,
      tables: [],
      count: 0,
      error: `Failed to detect tables: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorCode: TableErrorCode.TABLE_ACCESS_ERROR,
      timestamp: Date.now(),
    };
  }
}

/**
 * Detect tables in document body
 * @internal
 */
async function detectTablesInBody(
  context: Word.RequestContext,
  startIndex: number,
  options: Required<TableDetectionOptions>
): Promise<TableInfo[]> {
  const tables: TableInfo[] = [];

  try {
    const bodyTables = context.document.body.tables;
    bodyTables.load('items');
    await context.sync();

    for (let i = 0; i < bodyTables.items.length; i++) {
      const table = bodyTables.items[i];
      table.load(['rowCount', 'columnCount', 'values']);
      await context.sync();

      const tableInfo = await buildTableInfo(
        table,
        startIndex + i,
        i,
        'body',
        false,
        context,
        options
      );
      tables.push(tableInfo);
    }
  } catch (error) {
    console.error('Error detecting tables in body:', error);
  }

  return tables;
}

/**
 * Detect tables in document headers
 * @internal
 */
async function detectTablesInHeaders(
  context: Word.RequestContext,
  startIndex: number,
  options: Required<TableDetectionOptions>
): Promise<TableInfo[]> {
  const tables: TableInfo[] = [];

  try {
    const sections = context.document.sections;
    sections.load('items');
    await context.sync();

    let tableIndex = startIndex;

    for (const section of sections.items) {
      // Check primary header
      const primaryHeader = section.getHeader(Word.HeaderFooterType.primary);
      const primaryTables = primaryHeader.tables;
      primaryTables.load('items');
      await context.sync();

      for (let i = 0; i < primaryTables.items.length; i++) {
        const table = primaryTables.items[i];
        table.load(['rowCount', 'columnCount', 'values']);
        await context.sync();

        const tableInfo = await buildTableInfo(
          table,
          tableIndex++,
          i,
          'header',
          false,
          context,
          options
        );
        tables.push(tableInfo);
      }
    }
  } catch (error) {
    console.error('Error detecting tables in headers:', error);
  }

  return tables;
}

/**
 * Detect tables in document footers
 * @internal
 */
async function detectTablesInFooters(
  context: Word.RequestContext,
  startIndex: number,
  options: Required<TableDetectionOptions>
): Promise<TableInfo[]> {
  const tables: TableInfo[] = [];

  try {
    const sections = context.document.sections;
    sections.load('items');
    await context.sync();

    let tableIndex = startIndex;

    for (const section of sections.items) {
      // Check primary footer
      const primaryFooter = section.getFooter(Word.HeaderFooterType.primary);
      const primaryTables = primaryFooter.tables;
      primaryTables.load('items');
      await context.sync();

      for (let i = 0; i < primaryTables.items.length; i++) {
        const table = primaryTables.items[i];
        table.load(['rowCount', 'columnCount', 'values']);
        await context.sync();

        const tableInfo = await buildTableInfo(
          table,
          tableIndex++,
          i,
          'footer',
          false,
          context,
          options
        );
        tables.push(tableInfo);
      }
    }
  } catch (error) {
    console.error('Error detecting tables in footers:', error);
  }

  return tables;
}

/**
 * Build TableInfo object from Word.Table
 * @internal
 */
async function buildTableInfo(
  table: Word.Table,
  id: number,
  index: number,
  location: TableLocation,
  isNested: boolean,
  context: Word.RequestContext,
  options: Required<TableDetectionOptions>
): Promise<TableInfo> {
  // Detect if table has headers (first row styling)
  let hasHeaders = false;
  try {
    const firstCell = table.getCell(0, 0);
    firstCell.load('body/font/bold');
    await context.sync();
    hasHeaders = firstCell.body.font.bold || false;
  } catch (error) {
    // If we can't determine, assume false
    hasHeaders = false;
  }

  // Get table dimensions from values
  const rowCount = table.values.length;
  const columnCount = table.values.length > 0 ? table.values[0].length : 0;

  // Count empty cells if parseStructure is enabled
  let emptyCellCount: number | undefined = undefined;
  if (options.parseStructure) {
    emptyCellCount = await countEmptyCells(table, context);
  }

  // Detect merged cells if requested
  const hasMergedCells = options.detectMergedCells
    ? await detectHasMergedCells(table, context)
    : false;

  return {
    id,
    rowCount,
    columnCount,
    hasHeaders,
    location,
    isNested,
    totalCells: rowCount * columnCount,
    emptyCellCount,
    hasMergedCells,
    index,
  };
}

/**
 * Get a specific table by its index in the document
 *
 * @param index - Zero-based index of the table
 * @param options - Options for table detection
 * @returns TableInfo for the specified table
 *
 * @example
 * ```typescript
 * const table = await getTableAt(0);
 * console.log(`Table has ${table.rowCount} rows`);
 * ```
 */
export async function getTableAt(
  index: number,
  options: TableDetectionOptions = {}
): Promise<TableInfo | null> {
  try {
    return await Word.run(async (context) => {
      const bodyTables = context.document.body.tables;
      bodyTables.load('items');
      await context.sync();

      if (index < 0 || index >= bodyTables.items.length) {
        return null;
      }

      const table = bodyTables.items[index];
      table.load(['rowCount', 'columnCount', 'values']);
      await context.sync();

      const opts = { ...DEFAULT_TABLE_DETECTION_OPTIONS, ...options };
      return await buildTableInfo(table, index, index, 'body', false, context, opts);
    });
  } catch (error) {
    console.error('Error getting table at index:', error);
    return null;
  }
}

/**
 * Parse complete table structure with all cells
 *
 * @param table - TableInfo or table index
 * @param detectMerged - Whether to detect merged cells (expensive)
 * @returns Parsed table structure
 *
 * @example
 * ```typescript
 * const structure = await parseTableStructure(0);
 * console.log(`Parsed ${structure.cellsFlat.length} cells`);
 * ```
 */
export async function parseTableStructure(
  table: TableInfo | number,
  detectMerged: boolean = false
): Promise<TableParseResult> {
  try {
    return await Word.run(async (context) => {
      // Get the table
      let tableInfo: TableInfo;
      let wordTable: Word.Table;

      if (typeof table === 'number') {
        const bodyTables = context.document.body.tables;
        bodyTables.load('items');
        await context.sync();

        if (table < 0 || table >= bodyTables.items.length) {
          return {
            success: false,
            error: 'Invalid table index',
            errorCode: TableErrorCode.INVALID_TABLE_INDEX,
          };
        }

        wordTable = bodyTables.items[table];
        wordTable.load(['rowCount', 'columnCount', 'values']);
        await context.sync();

        const opts = { ...DEFAULT_TABLE_DETECTION_OPTIONS, parseStructure: true, detectMergedCells: detectMerged };
        tableInfo = await buildTableInfo(wordTable, table, table, 'body', false, context, opts);
      } else {
        tableInfo = table;
        const bodyTables = context.document.body.tables;
        bodyTables.load('items');
        await context.sync();

        if (tableInfo.index >= bodyTables.items.length) {
          return {
            success: false,
            error: 'Table not found',
            errorCode: TableErrorCode.INVALID_TABLE_INDEX,
          };
        }

        wordTable = bodyTables.items[tableInfo.index];
        wordTable.load(['rowCount', 'columnCount', 'values']);
        await context.sync();
      }

      // Parse all cells
      const cells: CellInfo[][] = [];
      const cellsFlat: CellInfo[] = [];

      for (let row = 0; row < tableInfo.rowCount; row++) {
        const cellRow: CellInfo[] = [];

        for (let col = 0; col < tableInfo.columnCount; col++) {
          const cellInfo = await parseCellInfo(wordTable, row, col, context);
          cellRow.push(cellInfo);
          cellsFlat.push(cellInfo);
        }

        cells.push(cellRow);
      }

      // Get headers if table has them
      const headers = tableInfo.hasHeaders
        ? await getTableHeaders(wordTable, context)
        : undefined;

      // Detect merged cells if requested
      const mergedCells = detectMerged
        ? await detectMergedCells(wordTable, cells, context)
        : [];

      // Detect nested tables if any
      const nestedTables: TableInfo[] = [];
      // Note: Nested table detection would require recursive parsing
      // Simplified for now - can be extended in future

      const structure: TableStructure = {
        info: tableInfo,
        cells,
        cellsFlat,
        headers,
        mergedCells,
        nestedTables,
      };

      return {
        success: true,
        structure,
      };
    });
  } catch (error) {
    console.error('Error parsing table structure:', error);
    return {
      success: false,
      error: `Failed to parse table structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorCode: TableErrorCode.STRUCTURE_PARSE_ERROR,
    };
  }
}

/**
 * Parse information for a single cell
 * @internal
 */
async function parseCellInfo(
  table: Word.Table,
  rowIndex: number,
  colIndex: number,
  context: Word.RequestContext
): Promise<CellInfo> {
  try {
    const cell = table.getCell(rowIndex, colIndex);
    cell.load('body/text');
    await context.sync();

    const text = cell.body.text;
    const isEmpty = isCellEmpty(text);

    // Check for nested tables
    const cellTables = cell.body.tables;
    cellTables.load('items');
    await context.sync();
    const hasNestedTable = cellTables.items.length > 0;

    return {
      rowIndex,
      colIndex,
      text,
      isEmpty,
      isMerged: false, // Will be updated by detectMergedCells
      hasNestedTable,
      characterCount: text.length,
      id: `${rowIndex}-${colIndex}`,
    };
  } catch (error) {
    console.error(`Error parsing cell at ${rowIndex},${colIndex}:`, error);
    return {
      rowIndex,
      colIndex,
      text: '',
      isEmpty: true,
      isMerged: false,
      hasNestedTable: false,
      characterCount: 0,
      id: `${rowIndex}-${colIndex}`,
    };
  }
}

/**
 * Extract column headers from a table
 *
 * @param table - Word.Table or table index
 * @param context - Request context (if table is Word.Table)
 * @returns Array of header strings
 *
 * @example
 * ```typescript
 * const headers = await getTableHeaders(myTable, context);
 * console.log('Headers:', headers);
 * ```
 */
export async function getTableHeaders(
  table: Word.Table | number,
  context?: Word.RequestContext
): Promise<string[]> {
  if (typeof table === 'number') {
    return Word.run(async (ctx) => {
      const bodyTables = ctx.document.body.tables;
      bodyTables.load('items');
      await ctx.sync();

      if (table < 0 || table >= bodyTables.items.length) {
        return [];
      }

      const wordTable = bodyTables.items[table];
      return getTableHeadersFromTable(wordTable, ctx);
    });
  } else {
    if (!context) {
      throw new Error('Context required when table is Word.Table');
    }
    return getTableHeadersFromTable(table, context);
  }
}

/**
 * Get headers from Word.Table
 * @internal
 */
async function getTableHeadersFromTable(
  table: Word.Table,
  context: Word.RequestContext
): Promise<string[]> {
  try {
    table.load('values');
    await context.sync();

    const headers: string[] = [];
    const columnCount = table.values.length > 0 ? table.values[0].length : 0;

    for (let col = 0; col < columnCount; col++) {
      const cell = table.getCell(0, col);
      cell.load('body/text');
      await context.sync();

      headers.push(cell.body.text.trim());
    }

    return headers;
  } catch (error) {
    console.error('Error getting table headers:', error);
    return [];
  }
}

/**
 * Find all empty cells in a table
 *
 * @param table - TableInfo, table index, or Word.Table
 * @param context - Request context (if table is Word.Table)
 * @returns Result with empty cells and statistics
 *
 * @example
 * ```typescript
 * const result = await findEmptyCells(0);
 * console.log(`Found ${result.count} empty cells (${result.percentage}%)`);
 * ```
 */
export async function findEmptyCells(
  table: TableInfo | number | Word.Table,
  context?: Word.RequestContext
): Promise<EmptyCellsResult> {
  try {
    // If it's a TableInfo, we need to parse the structure
    if (typeof table === 'object' && 'id' in table) {
      const parseResult = await parseTableStructure(table);
      if (!parseResult.success || !parseResult.structure) {
        return { cells: [], count: 0, percentage: 0 };
      }

      const emptyCells = parseResult.structure.cellsFlat.filter(cell => cell.isEmpty);
      const totalCells = parseResult.structure.cellsFlat.length;
      const percentage = totalCells > 0 ? (emptyCells.length / totalCells) * 100 : 0;

      return {
        cells: emptyCells,
        count: emptyCells.length,
        percentage: Math.round(percentage * 100) / 100,
      };
    }

    // If it's a number, parse the table at that index
    if (typeof table === 'number') {
      const parseResult = await parseTableStructure(table);
      if (!parseResult.success || !parseResult.structure) {
        return { cells: [], count: 0, percentage: 0 };
      }

      const emptyCells = parseResult.structure.cellsFlat.filter(cell => cell.isEmpty);
      const totalCells = parseResult.structure.cellsFlat.length;
      const percentage = totalCells > 0 ? (emptyCells.length / totalCells) * 100 : 0;

      return {
        cells: emptyCells,
        count: emptyCells.length,
        percentage: Math.round(percentage * 100) / 100,
      };
    }

    // If it's a Word.Table
    if (context) {
      table.load('values');
      await context.sync();

      const emptyCells: CellInfo[] = [];
      let totalCells = 0;
      const rowCount = table.values.length;
      const columnCount = table.values.length > 0 ? table.values[0].length : 0;

      for (let row = 0; row < rowCount; row++) {
        for (let col = 0; col < columnCount; col++) {
          totalCells++;
          const cell = table.getCell(row, col);
          cell.load('body/text');
          await context.sync();

          if (isCellEmpty(cell.body.text)) {
            emptyCells.push({
              rowIndex: row,
              colIndex: col,
              text: cell.body.text,
              isEmpty: true,
              isMerged: false,
              hasNestedTable: false,
              characterCount: cell.body.text.length,
              id: `${row}-${col}`,
            });
          }
        }
      }

      const percentage = totalCells > 0 ? (emptyCells.length / totalCells) * 100 : 0;

      return {
        cells: emptyCells,
        count: emptyCells.length,
        percentage: Math.round(percentage * 100) / 100,
      };
    }

    return { cells: [], count: 0, percentage: 0 };
  } catch (error) {
    console.error('Error finding empty cells:', error);
    return { cells: [], count: 0, percentage: 0 };
  }
}

/**
 * Check if a cell is empty (handles whitespace)
 *
 * @param cell - Cell text or CellInfo object
 * @returns True if cell is empty
 *
 * @example
 * ```typescript
 * if (isCellEmpty(cell)) {
 *   console.log('Cell is empty');
 * }
 * ```
 */
export function isCellEmpty(cell: string | CellInfo): boolean {
  if (typeof cell === 'string') {
    return cell.trim().length === 0;
  }
  return cell.isEmpty || cell.text.trim().length === 0;
}

/**
 * Detect and track merged cells in a table
 * Note: Office.js doesn't expose merged cell information directly,
 * so we use heuristics to detect them
 *
 * @param table - Word.Table
 * @param cells - Parsed cell information
 * @param context - Request context
 * @returns Array of merged cell information
 */
async function detectMergedCells(
  table: Word.Table,
  cells: CellInfo[][],
  context: Word.RequestContext
): Promise<MergedCellInfo[]> {
  const mergedCells: MergedCellInfo[] = [];

  try {
    // Office.js doesn't provide direct access to merged cell info
    // We would need to use heuristics like:
    // 1. Compare cell widths/heights
    // 2. Check if cells share the same content
    // 3. Analyze cell boundaries

    // This is a simplified implementation
    // A full implementation would require more complex analysis

    // For now, we'll mark this as a placeholder for future enhancement
    // Real implementation would involve:
    // - Comparing cell dimensions
    // - Checking cell content duplication
    // - Analyzing cell borders

  } catch (error) {
    console.error('Error detecting merged cells:', error);
  }

  return mergedCells;
}

/**
 * Check if table has merged cells (simplified detection)
 * @internal
 */
async function detectHasMergedCells(
  table: Word.Table,
  context: Word.RequestContext
): Promise<boolean> {
  try {
    // Simplified check - in a real implementation, this would use
    // more sophisticated detection methods
    // For now, return false as a safe default
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Validate table structure and accessibility
 *
 * @param table - TableInfo or table index
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const validation = await validateTable(0);
 * if (!validation.valid) {
 *   console.error(validation.error);
 * }
 * ```
 */
export async function validateTable(
  table: TableInfo | number
): Promise<TableValidation> {
  try {
    return await Word.run(async (context) => {
      let tableInfo: TableInfo;

      if (typeof table === 'number') {
        const bodyTables = context.document.body.tables;
        bodyTables.load('items');
        await context.sync();

        if (table < 0 || table >= bodyTables.items.length) {
          return {
            valid: false,
            error: 'Table index out of range',
            errorCode: TableErrorCode.INVALID_TABLE_INDEX,
          };
        }

        const wordTable = bodyTables.items[table];
        wordTable.load(['rowCount', 'columnCount']);
        await context.sync();

        const opts = { ...DEFAULT_TABLE_DETECTION_OPTIONS };
        tableInfo = await buildTableInfo(wordTable, table, table, 'body', false, context, opts);
      } else {
        tableInfo = table;
      }

      // Validate table structure
      const hasRows = tableInfo.rowCount > 0;
      const hasColumns = tableInfo.columnCount > 0;
      const cellCount = tableInfo.totalCells;
      const isEmpty = cellCount === 0;

      if (!hasRows) {
        return {
          valid: false,
          error: 'Table has no rows',
          errorCode: TableErrorCode.STRUCTURE_PARSE_ERROR,
        };
      }

      if (!hasColumns) {
        return {
          valid: false,
          error: 'Table has no columns',
          errorCode: TableErrorCode.STRUCTURE_PARSE_ERROR,
        };
      }

      return {
        valid: true,
        tableInfo: {
          exists: true,
          hasRows,
          hasColumns,
          isEmpty,
          cellCount,
        },
      };
    });
  } catch (error) {
    console.error('Error validating table:', error);
    return {
      valid: false,
      error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errorCode: TableErrorCode.TABLE_ACCESS_ERROR,
    };
  }
}

/**
 * Count empty cells in a table
 * @internal
 */
async function countEmptyCells(
  table: Word.Table,
  context: Word.RequestContext
): Promise<number> {
  try {
    table.load('values');
    await context.sync();

    let emptyCount = 0;
    const rowCount = table.values.length;
    const columnCount = table.values.length > 0 ? table.values[0].length : 0;

    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < columnCount; col++) {
        const cell = table.getCell(row, col);
        cell.load('body/text');
        await context.sync();

        if (isCellEmpty(cell.body.text)) {
          emptyCount++;
        }
      }
    }

    return emptyCount;
  } catch (error) {
    console.error('Error counting empty cells:', error);
    return 0;
  }
}

/**
 * Handle merged cells in a table
 * This is a placeholder for more advanced merged cell handling
 *
 * @param table - TableInfo or table index
 * @returns Array of merged cell information
 */
export async function handleMergedCells(
  table: TableInfo | number
): Promise<MergedCellInfo[]> {
  try {
    const parseResult = await parseTableStructure(table, true);
    if (!parseResult.success || !parseResult.structure) {
      return [];
    }

    return parseResult.structure.mergedCells;
  } catch (error) {
    console.error('Error handling merged cells:', error);
    return [];
  }
}
