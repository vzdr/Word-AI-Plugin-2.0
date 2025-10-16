/**
 * Comprehensive tests for table filler utilities
 *
 * Tests the table filling functions with various strategies,
 * validation, and error handling scenarios.
 *
 * Note: These tests mock Office.js Word API and tableService functions
 */

import {
  fillEmptyCells,
  fillCellsWithContent,
  previewFillChanges,
  buildCellContext,
  validateFillOperation,
  FillStrategy,
  CellUpdate,
  FillOperationResult,
  FillPreview,
  FillValidation,
} from '../tableFiller';
import {
  TableStructure,
  CellInfo,
  TableInfo,
  AutoFillOptions,
  DEFAULT_AUTOFILL_OPTIONS,
} from '../../types/table';
import * as tableDetection from '../tableDetection';
import * as tableService from '../../services/tableService';

// Mock tableDetection module
jest.mock('../tableDetection');
const mockParseTableStructure = tableDetection.parseTableStructure as jest.MockedFunction<
  typeof tableDetection.parseTableStructure
>;

// Mock tableService module
jest.mock('../../services/tableService');
const mockGenerateBatchCellContent = tableService.generateBatchCellContent as jest.MockedFunction<
  typeof tableService.generateBatchCellContent
>;
const mockInferTablePurpose = tableService.inferTablePurpose as jest.MockedFunction<
  typeof tableService.inferTablePurpose
>;
const mockExtractSampleData = tableService.extractSampleData as jest.MockedFunction<
  typeof tableService.extractSampleData
>;

// Mock Office.js global
declare global {
  namespace Word {
    function run<T>(callback: (context: RequestContext) => Promise<T>): Promise<T>;

    interface RequestContext {
      document: Document;
      sync(): Promise<void>;
    }

    interface Document {
      body: Body;
    }

    interface Body {
      tables: TableCollection;
    }

    interface TableCollection {
      items: Table[];
      load(properties: string | string[]): void;
    }

    interface Table {
      rowCount: number;
      columnCount: number;
      load(properties: string | string[]): void;
      getCell(rowIndex: number, colIndex: number): TableCell;
    }

    interface TableCell {
      body: CellBody;
    }

    interface CellBody {
      clear(): void;
      insertText(text: string, location: string): void;
    }

    namespace InsertLocation {
      const start: string;
    }
  }
}

// Mock Word global
(global as any).Word = {
  run: jest.fn(),
  InsertLocation: {
    start: 'Start',
  },
};

// Helper to create mock table structure
function createMockTableStructure(
  rows: string[][],
  hasHeaders: boolean = true
): TableStructure {
  const rowCount = rows.length;
  const columnCount = rows[0]?.length || 0;
  const headers = hasHeaders ? rows[0] : undefined;

  const cells: CellInfo[][] = rows.map((row, rowIndex) =>
    row.map((text, colIndex) => ({
      rowIndex,
      colIndex,
      text,
      isEmpty: text.trim().length === 0,
      isMerged: false,
      hasNestedTable: false,
      characterCount: text.length,
      id: `${rowIndex}-${colIndex}`,
    }))
  );

  const cellsFlat = cells.flat();

  const info: TableInfo = {
    index: 0,
    id: 'table-0',
    rowCount,
    columnCount,
    totalCells: rowCount * columnCount,
    location: 'body',
    hasHeaders,
    hasMergedCells: false,
    hasNestedTables: false,
  };

  return {
    info,
    cells,
    cellsFlat,
    headers,
  };
}

// Helper to create mock context
function createMockWordContext(table: { rowCount: number; columnCount: number }): Word.RequestContext {
  const mockCells: Record<string, any> = {};

  // Create mock cells
  for (let row = 0; row < table.rowCount; row++) {
    for (let col = 0; col < table.columnCount; col++) {
      const key = `${row}-${col}`;
      mockCells[key] = {
        body: {
          clear: jest.fn(),
          insertText: jest.fn(),
        },
      };
    }
  }

  return {
    document: {
      body: {
        tables: {
          items: [
            {
              rowCount: table.rowCount,
              columnCount: table.columnCount,
              load: jest.fn(),
              getCell: jest.fn((rowIndex: number, colIndex: number) => {
                const key = `${rowIndex}-${colIndex}`;
                return mockCells[key];
              }),
            },
          ],
          load: jest.fn(),
        },
      } as Word.Body,
    } as Word.Document,
    sync: jest.fn().mockResolvedValue(undefined),
  } as Word.RequestContext;
}

describe('buildCellContext', () => {
  it('should build context for cell with all surrounding cells', () => {
    const table = createMockTableStructure([
      ['Name', 'Age', 'City'],
      ['John', '30', 'NYC'],
      ['Jane', '', 'LA'],
    ]);

    const cell = table.cells[2][1]; // Empty cell in Jane's row

    const context = buildCellContext(cell, table);

    expect(context.rowIndex).toBe(2);
    expect(context.colIndex).toBe(1);
    expect(context.columnHeader).toBe('Age');
    expect(context.rowContext).toEqual(['Jane', 'LA']);
    expect(context.adjacentCells.left).toBe('Jane');
    expect(context.adjacentCells.right).toBe('LA');
    expect(context.adjacentCells.top).toBe('30');
  });

  it('should handle edge cells without all adjacent cells', () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', 'D'],
    ]);

    const cell = table.cells[0][0]; // Top-left corner

    const context = buildCellContext(cell, table);

    expect(context.adjacentCells.left).toBeUndefined();
    expect(context.adjacentCells.top).toBeUndefined();
    expect(context.adjacentCells.right).toBe('B');
    expect(context.adjacentCells.bottom).toBe('C');
  });

  it('should extract column context from same column', () => {
    const table = createMockTableStructure([
      ['Name', 'Age'],
      ['John', '30'],
      ['Jane', '25'],
      ['Bob', ''],
    ]);

    const cell = table.cells[3][1]; // Empty age for Bob

    const context = buildCellContext(cell, table);

    expect(context.columnContext).toContain('30');
    expect(context.columnContext).toContain('25');
    expect(context.columnContext).not.toContain(''); // Filters empty
  });
});

describe('validateFillOperation', () => {
  it('should validate successful operation', () => {
    const table = createMockTableStructure([
      ['Name', 'Age'],
      ['John', ''],
      ['Jane', ''],
    ]);

    const validation = validateFillOperation(table, []);

    expect(validation.valid).toBe(true);
    expect(validation.fillableCount).toBe(2); // Two empty cells
  });

  it('should fail validation for invalid table', () => {
    const validation = validateFillOperation(null as any, []);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Invalid table structure');
  });

  it('should fail validation for table with no cells', () => {
    const table = createMockTableStructure([]);
    table.info.totalCells = 0;

    const validation = validateFillOperation(table, []);

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('no cells');
  });

  it('should fail validation for invalid target rows', () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', 'D'],
    ]);

    const validation = validateFillOperation(table, [], { targetRows: [5, 10] });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Invalid target rows');
  });

  it('should fail validation for invalid target columns', () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', 'D'],
    ]);

    const validation = validateFillOperation(table, [], { targetColumns: [5, 10] });

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Invalid target columns');
  });

  it('should warn when filling many cells', () => {
    // Create table with 60 empty cells
    const rows = Array.from({ length: 10 }, (_, row) =>
      Array.from({ length: 6 }, () => '')
    );
    const table = createMockTableStructure(rows, false);

    const validation = validateFillOperation(table, []);

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toBeDefined();
    expect(validation.warnings?.[0]).toContain('may take a while');
  });

  it('should warn about merged cells', () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', ''],
    ]);
    table.info.hasMergedCells = true;

    const validation = validateFillOperation(table, [], { skipMergedCells: false });

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toBeDefined();
    expect(validation.warnings?.[0]).toContain('merged cells');
  });
});

describe('previewFillChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate preview for empty cells', async () => {
    const table = createMockTableStructure([
      ['Name', 'Age', 'City'],
      ['John', '', 'NYC'],
      ['Jane', '25', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    const preview = await previewFillChanges(0, 'CONTEXTUAL');

    expect(preview).not.toBeNull();
    expect(preview?.count).toBe(2); // Two empty cells
    expect(preview?.strategy).toBe('CONTEXTUAL');
    expect(preview?.percentage).toBeGreaterThan(0);
  });

  it('should return null if table parsing fails', async () => {
    mockParseTableStructure.mockResolvedValue({
      success: false,
      error: 'Failed to parse',
      timestamp: Date.now(),
    });

    const preview = await previewFillChanges(0, 'BATCH');

    expect(preview).toBeNull();
  });

  it('should calculate percentage correctly', async () => {
    const table = createMockTableStructure([
      ['A', 'B', 'C', 'D'],
      ['1', '', '', '4'],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    const preview = await previewFillChanges(0, 'BATCH');

    expect(preview?.count).toBe(2);
    expect(preview?.percentage).toBe(25); // 2/8 = 25%
  });

  it('should respect maxCells option in preview', async () => {
    const rows = Array.from({ length: 5 }, () => ['', '', '']);
    const table = createMockTableStructure(rows, false);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    const preview = await previewFillChanges(0, 'BATCH', { maxCells: 5 });

    expect(preview?.count).toBe(5); // Limited to maxCells
  });
});

describe('fillCellsWithContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fill cells with provided content', async () => {
    const mockContext = createMockWordContext({ rowCount: 3, columnCount: 3 });

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const updates: CellUpdate[] = [
      { rowIndex: 0, colIndex: 1, content: 'Test1', success: true },
      { rowIndex: 1, colIndex: 2, content: 'Test2', success: true },
    ];

    const result = await fillCellsWithContent(0, updates);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(result.totalAttempted).toBe(2);
  });

  it('should skip failed generation updates', async () => {
    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const updates: CellUpdate[] = [
      { rowIndex: 0, colIndex: 0, content: 'OK', success: true },
      { rowIndex: 0, colIndex: 1, content: '', success: false, error: 'AI failed' },
    ];

    const result = await fillCellsWithContent(0, updates);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('should handle invalid cell coordinates', async () => {
    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const updates: CellUpdate[] = [
      { rowIndex: 10, colIndex: 10, content: 'Invalid', success: true },
    ];

    const result = await fillCellsWithContent(0, updates);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.updates[0].error).toContain('Invalid cell coordinates');
  });

  it('should handle invalid table index', async () => {
    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const updates: CellUpdate[] = [
      { rowIndex: 0, colIndex: 0, content: 'Test', success: true },
    ];

    const result = await fillCellsWithContent(5, updates); // Invalid index

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid table index');
  });

  it('should handle Word API errors gracefully', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Word API error'));

    const updates: CellUpdate[] = [
      { rowIndex: 0, colIndex: 0, content: 'Test', success: true },
    ];

    const result = await fillCellsWithContent(0, updates);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Word API error');
  });
});

describe('fillEmptyCells', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSettings = {
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 100,
  };

  it('should fill cells using CONTEXTUAL strategy', async () => {
    const table = createMockTableStructure([
      ['Name', 'Age'],
      ['John', ''],
      ['Jane', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('User data table');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        {
          content: '30',
          success: true,
          rowIndex: 1,
          colIndex: 1,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
        {
          content: '25',
          success: true,
          rowIndex: 2,
          colIndex: 1,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
      ],
      successCount: 2,
      failureCount: 0,
      totalUsage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });

    const mockContext = createMockWordContext({ rowCount: 3, columnCount: 2 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'CONTEXTUAL', mockSettings);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(2);
    expect(result.totalAttempted).toBe(2);
    expect(mockGenerateBatchCellContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      mockSettings,
      '', // context defaults to empty string
      5 // CONTEXTUAL uses batch size 5
    );
  });

  it('should fill cells using BATCH strategy', async () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data table');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        { content: 'X', success: true, rowIndex: 1, colIndex: 0, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
        { content: 'Y', success: true, rowIndex: 1, colIndex: 1, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
      ],
      successCount: 2,
      failureCount: 0,
      totalUsage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    });

    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.success).toBe(true);
    expect(mockGenerateBatchCellContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      mockSettings,
      '', // context defaults to empty string
      10 // BATCH uses batch size 10
    );
  });

  it('should fill cells using SELECTIVE strategy', async () => {
    const table = createMockTableStructure([
      ['A', 'B', 'C'],
      ['', '', ''],
      ['', '', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data table');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        { content: 'X', success: true, rowIndex: 1, colIndex: 0, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
      ],
      successCount: 1,
      failureCount: 0,
      totalUsage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    });

    const mockContext = createMockWordContext({ rowCount: 3, columnCount: 3 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'SELECTIVE', mockSettings, {
      targetRows: [1],
      targetColumns: [0],
    });

    expect(result.success).toBe(true);
    // Only cells matching both row 1 AND column 0 should be filled
  });

  it('should return error if table parsing fails', async () => {
    mockParseTableStructure.mockResolvedValue({
      success: false,
      error: 'Table not found',
      timestamp: Date.now(),
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Table not found');
    expect(result.filledCount).toBe(0);
  });

  it('should return success with zero filled if no empty cells', async () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', 'D'],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(0);
    expect(result.totalAttempted).toBe(0);
  });

  it('should respect emptyOnly option', async () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['C', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        { content: 'X', success: true, rowIndex: 1, colIndex: 1, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
      ],
      successCount: 1,
      failureCount: 0,
      totalUsage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    });

    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings, { emptyOnly: true });

    expect(result.success).toBe(true);
    expect(result.totalAttempted).toBe(1); // Only empty cell
  });

  it('should respect maxCells limit', async () => {
    const rows = Array.from({ length: 10 }, () => ['', '', '']);
    const table = createMockTableStructure(rows, false);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: Array.from({ length: 5 }, (_, i) => ({
        content: 'X',
        success: true,
        rowIndex: Math.floor(i / 3),
        colIndex: i % 3,
        usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
      })),
      successCount: 5,
      failureCount: 0,
      totalUsage: { promptTokens: 25, completionTokens: 10, totalTokens: 35 },
    });

    const mockContext = createMockWordContext({ rowCount: 10, columnCount: 3 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings, { maxCells: 5 });

    expect(result.totalAttempted).toBe(5); // Limited by maxCells
  });

  it('should handle AI generation failures gracefully', async () => {
    const table = createMockTableStructure([
      ['A', 'B'],
      ['', ''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        { content: 'OK', success: true, rowIndex: 1, colIndex: 0, usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
        { content: '', success: false, error: 'AI error', rowIndex: 1, colIndex: 1 },
      ],
      successCount: 1,
      failureCount: 1,
      totalUsage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
    });

    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 2 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.success).toBe(true);
    expect(result.filledCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });

  it('should include token usage in result', async () => {
    const table = createMockTableStructure([
      ['A'],
      [''],
    ]);

    mockParseTableStructure.mockResolvedValue({
      success: true,
      structure: table,
      timestamp: Date.now(),
    });

    mockInferTablePurpose.mockReturnValue('Data');
    mockExtractSampleData.mockReturnValue([]);

    mockGenerateBatchCellContent.mockResolvedValue({
      results: [
        { content: 'X', success: true, rowIndex: 1, colIndex: 0, usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } },
      ],
      successCount: 1,
      failureCount: 0,
      totalUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    const mockContext = createMockWordContext({ rowCount: 2, columnCount: 1 });
    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.usage).toBeDefined();
    expect(result.usage?.totalTokens).toBe(150);
    expect(result.usage?.promptTokens).toBe(100);
    expect(result.usage?.completionTokens).toBe(50);
  });

  it('should handle exceptions and return error', async () => {
    mockParseTableStructure.mockRejectedValue(new Error('Unexpected error'));

    const result = await fillEmptyCells(0, 'BATCH', mockSettings);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unexpected error');
  });
});

describe('Edge cases and integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle table with only headers', () => {
    const table = createMockTableStructure([['Name', 'Age', 'City']]);

    const validation = validateFillOperation(table, [], { includeHeaders: false });

    expect(validation.valid).toBe(true);
    expect(validation.warnings).toBeDefined();
  });

  it('should handle single cell table', () => {
    const table = createMockTableStructure([['']], false); // No headers for single cell

    const validation = validateFillOperation(table, []);

    expect(validation.valid).toBe(true);
    expect(validation.fillableCount).toBe(1);
  });

  it('should build context for cell in single-row table', () => {
    const table = createMockTableStructure([['A', '', 'C']]);

    const cell = table.cells[0][1];
    const context = buildCellContext(cell, table);

    expect(context.rowContext).toEqual(['A', 'C']);
    expect(context.adjacentCells.top).toBeUndefined();
    expect(context.adjacentCells.bottom).toBeUndefined();
  });

  it('should build context for cell in single-column table', () => {
    const table = createMockTableStructure([['A'], [''], ['C']]);

    const cell = table.cells[1][0];
    const context = buildCellContext(cell, table);

    expect(context.rowContext).toEqual([]);
    expect(context.adjacentCells.left).toBeUndefined();
    expect(context.adjacentCells.right).toBeUndefined();
    expect(context.adjacentCells.top).toBe('A');
    expect(context.adjacentCells.bottom).toBe('C');
  });
});
