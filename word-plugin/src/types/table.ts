/**
 * Table type definitions for Word AI Plugin
 * Defines interfaces for table detection, structure parsing, and cell manipulation
 * Compatible with Office.js Word API
 */

import { SelectionLocation } from '../utils/textSelection';

/**
 * Location types for tables in Word documents
 * Similar to SelectionLocation but specific to table contexts
 */
export type TableLocation =
  | 'body'
  | 'header'
  | 'footer'
  | 'textBox'
  | 'nestedTable'
  | 'unknown';

/**
 * Information about a merged cell span
 * Office.js doesn't expose rowSpan/colSpan directly,
 * so we track merged cells through detection heuristics
 */
export interface MergedCellInfo {
  /**
   * Starting row index of the merged cell
   */
  startRow: number;

  /**
   * Starting column index of the merged cell
   */
  startCol: number;

  /**
   * Number of rows this cell spans
   */
  rowSpan: number;

  /**
   * Number of columns this cell spans
   */
  colSpan: number;

  /**
   * Whether this is the primary cell (top-left) of the merge
   */
  isPrimaryCell: boolean;
}

/**
 * Detailed information about a single table cell
 */
export interface CellInfo {
  /**
   * Zero-based row index
   */
  rowIndex: number;

  /**
   * Zero-based column index
   */
  colIndex: number;

  /**
   * Text content of the cell
   */
  text: string;

  /**
   * Whether the cell is empty (no text or only whitespace)
   */
  isEmpty: boolean;

  /**
   * Whether this cell is part of a merged cell group
   */
  isMerged: boolean;

  /**
   * Merged cell information if applicable
   */
  mergeInfo?: MergedCellInfo;

  /**
   * Width of the cell (if available)
   */
  width?: number;

  /**
   * Height of the cell (if available)
   */
  height?: number;

  /**
   * Whether this cell contains a nested table
   */
  hasNestedTable: boolean;

  /**
   * Character count in the cell
   */
  characterCount: number;

  /**
   * Unique identifier for the cell (rowIndex-colIndex)
   */
  id: string;
}

/**
 * Complete table structure with all cells
 */
export interface TableStructure {
  /**
   * Basic table information
   */
  info: TableInfo;

  /**
   * All cells in the table (2D array: rows x columns)
   */
  cells: CellInfo[][];

  /**
   * Flat array of all cells (for easier iteration)
   */
  cellsFlat: CellInfo[];

  /**
   * Column headers if detected
   */
  headers?: string[];

  /**
   * Merged cell information
   */
  mergedCells: MergedCellInfo[];

  /**
   * Nested tables detected within this table
   */
  nestedTables: TableInfo[];
}

/**
 * Basic information about a table
 */
export interface TableInfo {
  /**
   * Unique identifier for the table (index in document)
   */
  id: number;

  /**
   * Number of rows in the table
   */
  rowCount: number;

  /**
   * Number of columns in the table
   */
  columnCount: number;

  /**
   * Whether the table has a header row
   */
  hasHeaders: boolean;

  /**
   * Location of the table in the document
   */
  location: TableLocation;

  /**
   * Whether this table is nested within another table
   */
  isNested: boolean;

  /**
   * Parent table ID if this is a nested table
   */
  parentTableId?: number;

  /**
   * Total number of cells (rowCount * columnCount)
   */
  totalCells: number;

  /**
   * Number of empty cells in the table
   */
  emptyCellCount?: number;

  /**
   * Whether the table contains merged cells
   */
  hasMergedCells: boolean;

  /**
   * Table index in the parent context (body, header, footer, etc.)
   */
  index: number;
}

/**
 * Options for table detection operations
 */
export interface TableDetectionOptions {
  /**
   * Whether to detect tables in headers
   * @default true
   */
  includeHeaders?: boolean;

  /**
   * Whether to detect tables in footers
   * @default true
   */
  includeFooters?: boolean;

  /**
   * Whether to detect nested tables
   * @default true
   */
  includeNested?: boolean;

  /**
   * Whether to detect tables in text boxes
   * @default false
   */
  includeTextBoxes?: boolean;

  /**
   * Maximum depth for nested table detection
   * @default 2
   */
  maxNestingDepth?: number;

  /**
   * Whether to parse full table structure (expensive)
   * If false, only basic info is returned
   * @default false
   */
  parseStructure?: boolean;

  /**
   * Whether to detect merged cells (expensive)
   * @default false
   */
  detectMergedCells?: boolean;
}

/**
 * Options for auto-fill operations
 * Used by Stream B for filling empty cells with AI-generated content
 */
export interface AutoFillOptions {
  /**
   * Whether to fill only empty cells
   * @default true
   */
  emptyOnly?: boolean;

  /**
   * Whether to preserve existing formatting
   * @default true
   */
  preserveFormatting?: boolean;

  /**
   * Whether to fill header row
   * @default false
   */
  includeHeaders?: boolean;

  /**
   * Maximum number of cells to fill in a single operation
   * @default 100
   */
  maxCells?: number;

  /**
   * Row indices to fill (if undefined, all rows)
   */
  targetRows?: number[];

  /**
   * Column indices to fill (if undefined, all columns)
   */
  targetColumns?: number[];

  /**
   * Strategy for filling cells
   */
  fillStrategy?: FillStrategy;

  /**
   * Context to use for AI generation
   */
  context?: string;

  /**
   * Whether to skip cells in merged cell groups
   * @default true
   */
  skipMergedCells?: boolean;
}

/**
 * Strategies for filling table cells
 */
export type FillStrategy =
  | 'row-by-row'      // Fill one row at a time
  | 'column-by-column' // Fill one column at a time
  | 'all-at-once'     // Fill all cells in one operation
  | 'cell-by-cell';   // Fill each cell individually

/**
 * Result of a table detection operation
 */
export interface TableDetectionResult {
  /**
   * Whether detection was successful
   */
  success: boolean;

  /**
   * Tables detected in the document
   */
  tables: TableInfo[];

  /**
   * Total number of tables found
   */
  count: number;

  /**
   * Error message if detection failed
   */
  error?: string;

  /**
   * Error code for categorizing failures
   */
  errorCode?: TableErrorCode;

  /**
   * Timestamp of detection operation
   */
  timestamp: number;
}

/**
 * Result of a table structure parsing operation
 */
export interface TableParseResult {
  /**
   * Whether parsing was successful
   */
  success: boolean;

  /**
   * Parsed table structure
   */
  structure?: TableStructure;

  /**
   * Error message if parsing failed
   */
  error?: string;

  /**
   * Error code for categorizing failures
   */
  errorCode?: TableErrorCode;
}

/**
 * Result of finding empty cells in a table
 */
export interface EmptyCellsResult {
  /**
   * Empty cells found in the table
   */
  cells: CellInfo[];

  /**
   * Count of empty cells
   */
  count: number;

  /**
   * Percentage of empty cells (0-100)
   */
  percentage: number;
}

/**
 * Error codes for table operations
 */
export enum TableErrorCode {
  NO_TABLES_FOUND = 'NO_TABLES_FOUND',
  INVALID_TABLE_INDEX = 'INVALID_TABLE_INDEX',
  TABLE_ACCESS_ERROR = 'TABLE_ACCESS_ERROR',
  STRUCTURE_PARSE_ERROR = 'STRUCTURE_PARSE_ERROR',
  CELL_ACCESS_ERROR = 'CELL_ACCESS_ERROR',
  MERGED_CELL_DETECTION_ERROR = 'MERGED_CELL_DETECTION_ERROR',
  NESTED_TABLE_ERROR = 'NESTED_TABLE_ERROR',
  CONTEXT_ERROR = 'CONTEXT_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Validation result for table operations
 */
export interface TableValidation {
  /**
   * Whether the table is valid
   */
  valid: boolean;

  /**
   * Validation error message
   */
  error?: string;

  /**
   * Validation error code
   */
  errorCode?: TableErrorCode;

  /**
   * Table information if valid
   */
  tableInfo?: {
    exists: boolean;
    hasRows: boolean;
    hasColumns: boolean;
    isEmpty: boolean;
    cellCount: number;
  };
}

/**
 * Default table detection options
 */
export const DEFAULT_TABLE_DETECTION_OPTIONS: Required<TableDetectionOptions> = {
  includeHeaders: true,
  includeFooters: true,
  includeNested: true,
  includeTextBoxes: false,
  maxNestingDepth: 2,
  parseStructure: false,
  detectMergedCells: false,
};

/**
 * Default auto-fill options
 */
export const DEFAULT_AUTOFILL_OPTIONS: Required<AutoFillOptions> = {
  emptyOnly: true,
  preserveFormatting: true,
  includeHeaders: false,
  maxCells: 100,
  targetRows: undefined as any, // Will be checked as undefined
  targetColumns: undefined as any, // Will be checked as undefined
  fillStrategy: 'row-by-row',
  context: '',
  skipMergedCells: true,
};
