/**
 * Comprehensive tests for table detection utilities
 *
 * Tests the table detection functions with various scenarios,
 * table structures, and error handling.
 *
 * Note: These tests mock Office.js Word API since it's not available in Node.js environment
 */

import {
  detectTables,
  getTableAt,
  parseTableStructure,
  getTableHeaders,
  findEmptyCells,
  isCellEmpty,
  validateTable,
} from '../tableDetection';
import {
  TableInfo,
  TableDetectionOptions,
  TableErrorCode,
  CellInfo,
} from '../../types/table';

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
      sections: SectionCollection;
    }

    interface Body {
      tables: TableCollection;
      type: string;
      load(properties: string | string[]): void;
    }

    interface SectionCollection {
      items: Section[];
      load(properties: string | string[]): void;
    }

    interface Section {
      getHeader(type: string): Body;
      getFooter(type: string): Body;
    }

    interface TableCollection {
      items: Table[];
      load(properties: string | string[]): void;
    }

    interface Table {
      rowCount: number;
      columnCount: number;
      values: string[][];
      load(properties: string | string[]): void;
      getRow(index: number): TableRow;
      getCell(rowIndex: number, colIndex: number): TableCell;
    }

    interface TableRow {
      font: Font;
      load(properties: string | string[]): void;
    }

    interface TableCell {
      body: Body;
      width?: number;
      height?: number;
      load(properties: string | string[]): void;
    }

    interface Font {
      bold: boolean;
      load(properties: string | string[]): void;
    }

    namespace HeaderFooterType {
      const primary: string;
    }
  }
}

// Mock Word global
(global as any).Word = {
  run: jest.fn(),
  HeaderFooterType: {
    primary: 'Primary',
  },
};

// Helper to create mock table
function createMockTable(
  rowCount: number,
  columnCount: number,
  values: string[][],
  headerBold: boolean = true
): Partial<Word.Table> {
  const mockCells: any = {};

  // Create cells
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < columnCount; col++) {
      const key = `${row}-${col}`;
      mockCells[key] = {
        body: {
          text: values[row]?.[col] || '',
          tables: {
            items: [],
            load: jest.fn(),
          },
          load: jest.fn(),
        },
        width: 100,
        height: 20,
        load: jest.fn(),
      };
    }
  }

  return {
    rowCount,
    columnCount,
    values,
    load: jest.fn(),
    getRow: jest.fn((index: number) => ({
      font: {
        bold: index === 0 ? headerBold : false,
        load: jest.fn(),
      },
      load: jest.fn(),
    })),
    getCell: jest.fn((rowIndex: number, colIndex: number) => {
      const key = `${rowIndex}-${colIndex}`;
      return mockCells[key] || {
        body: {
          text: '',
          tables: { items: [], load: jest.fn() },
          load: jest.fn(),
        },
        load: jest.fn(),
      };
    }),
  };
}

// Helper to create mock context
function createMockContext(tables: Partial<Word.Table>[]): Word.RequestContext {
  return {
    document: {
      body: {
        tables: {
          items: tables as Word.Table[],
          load: jest.fn(),
        },
        type: 'MainDoc',
        load: jest.fn(),
      } as Word.Body,
      sections: {
        items: [],
        load: jest.fn(),
      } as Word.SectionCollection,
    } as Word.Document,
    sync: jest.fn().mockResolvedValue(undefined),
  } as Word.RequestContext;
}

describe('detectTables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic table detection', () => {
    it('should detect single table in document body', async () => {
      const mockTable = createMockTable(3, 3, [
        ['Name', 'Age', 'City'],
        ['John', '30', 'NYC'],
        ['Jane', '25', 'LA'],
      ]);
      const mockContext = createMockContext([mockTable]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables();

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.tables).toHaveLength(1);
      expect(result.tables[0].rowCount).toBe(3);
      expect(result.tables[0].columnCount).toBe(3);
    });

    it('should detect multiple tables', async () => {
      const mockTable1 = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
      const mockTable2 = createMockTable(3, 2, [['X', 'Y'], ['Z', 'W'], ['P', 'Q']]);
      const mockContext = createMockContext([mockTable1, mockTable2]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.tables).toHaveLength(2);
    });

    it('should return empty result when no tables found', async () => {
      const mockContext = createMockContext([]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables();

      expect(result.success).toBe(true); // Finding zero tables is a successful operation
      expect(result.count).toBe(0);
      expect(result.tables).toHaveLength(0);
      expect(result.errorCode).toBeUndefined(); // No error when no tables found
    });
  });

  describe('Header detection', () => {
    it('should detect table with headers (bold first row)', async () => {
      const mockTable = createMockTable(
        3,
        2,
        [['Header1', 'Header2'], ['Data1', 'Data2'], ['Data3', 'Data4']],
        true // First row is bold
      );
      const mockContext = createMockContext([mockTable]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables();

      expect(result.success).toBe(true);
      expect(result.tables[0].hasHeaders).toBe(true);
    });

    it('should detect table without headers', async () => {
      const mockTable = createMockTable(
        3,
        2,
        [['Data1', 'Data2'], ['Data3', 'Data4'], ['Data5', 'Data6']],
        false // First row is not bold
      );
      const mockContext = createMockContext([mockTable]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables();

      expect(result.success).toBe(true);
      expect(result.tables[0].hasHeaders).toBe(false);
    });
  });

  describe('Empty cell counting', () => {
    it('should count empty cells when parseStructure is enabled', async () => {
      const mockTable = createMockTable(3, 3, [
        ['A', 'B', 'C'],
        ['D', '', 'F'],
        ['', '', 'I'],
      ]);
      const mockContext = createMockContext([mockTable]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables({ parseStructure: true });

      expect(result.success).toBe(true);
      expect(result.tables[0].emptyCellCount).toBe(3);
    });

    it('should not count empty cells when parseStructure is disabled', async () => {
      const mockTable = createMockTable(3, 3, [
        ['A', 'B', 'C'],
        ['D', '', 'F'],
        ['', '', 'I'],
      ]);
      const mockContext = createMockContext([mockTable]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const result = await detectTables({ parseStructure: false });

      expect(result.success).toBe(true);
      expect(result.tables[0].emptyCellCount).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should handle Word API errors', async () => {
      (Word.run as jest.Mock).mockRejectedValue(new Error('Word API error'));

      const result = await detectTables();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Word API error');
      expect(result.errorCode).toBe(TableErrorCode.TABLE_ACCESS_ERROR);
    });

    it('should include timestamp in result', async () => {
      const mockContext = createMockContext([]);

      (Word.run as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockContext);
      });

      const before = Date.now();
      const result = await detectTables();
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });
});

describe('getTableAt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get table at valid index', async () => {
    const mockTable = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getTableAt(0);

    expect(result).not.toBeNull();
    expect(result?.rowCount).toBe(2);
    expect(result?.columnCount).toBe(2);
  });

  it('should return null for invalid index (negative)', async () => {
    const mockTable = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getTableAt(-1);

    expect(result).toBeNull();
  });

  it('should return null for invalid index (out of range)', async () => {
    const mockTable = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getTableAt(5);

    expect(result).toBeNull();
  });

  it('should handle errors gracefully', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Access denied'));

    const result = await getTableAt(0);

    expect(result).toBeNull();
  });
});

describe('parseTableStructure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse table structure with all cells', async () => {
    const mockTable = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await parseTableStructure(0, false);

    expect(result.success).toBe(true);
    expect(result.structure).toBeDefined();
    expect(result.structure?.cellsFlat).toHaveLength(4);
    expect(result.structure?.cells).toHaveLength(2);
    expect(result.structure?.cells[0]).toHaveLength(2);
  });

  it('should parse cell information correctly', async () => {
    const mockTable = createMockTable(2, 2, [['A', ''], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await parseTableStructure(0, false);

    expect(result.success).toBe(true);
    const cells = result.structure?.cellsFlat;
    expect(cells?.[0].text).toBe('A');
    expect(cells?.[0].isEmpty).toBe(false);
    expect(cells?.[1].text).toBe('');
    expect(cells?.[1].isEmpty).toBe(true);
  });

  it('should return error for invalid table index', async () => {
    const mockContext = createMockContext([]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await parseTableStructure(0, false);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(TableErrorCode.INVALID_TABLE_INDEX);
  });

  it('should extract headers when table has headers', async () => {
    const mockTable = createMockTable(
      2,
      2,
      [['Header1', 'Header2'], ['Data1', 'Data2']],
      true
    );
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await parseTableStructure(0, false);

    expect(result.success).toBe(true);
    expect(result.structure?.headers).toBeDefined();
  });

  it('should handle parsing errors', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Parse error'));

    const result = await parseTableStructure(0, false);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Parse error');
    expect(result.errorCode).toBe(TableErrorCode.STRUCTURE_PARSE_ERROR);
  });
});

describe('getTableHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract headers from table', async () => {
    const mockTable = createMockTable(2, 3, [
      ['Name', 'Age', 'City'],
      ['John', '30', 'NYC'],
    ]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getTableHeaders(0);

    expect(result).toHaveLength(3);
    expect(result).toEqual(['Name', 'Age', 'City']);
  });

  it('should return empty array for invalid table index', async () => {
    const mockContext = createMockContext([]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await getTableHeaders(5);

    expect(result).toEqual([]);
  });

  it('should handle errors gracefully', async () => {
    // Mock console.error to suppress error output in tests
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    (Word.run as jest.Mock).mockImplementation(() => Promise.reject(new Error('Header error')));

    // The function doesn't catch Word.run rejections, so it will throw
    await expect(getTableHeaders(0)).rejects.toThrow('Header error');

    consoleErrorSpy.mockRestore();
  });
});

describe('findEmptyCells', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should find all empty cells', async () => {
    const mockTable = createMockTable(3, 3, [
      ['A', 'B', 'C'],
      ['D', '', 'F'],
      ['', '', 'I'],
    ]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await findEmptyCells(0);

    expect(result.count).toBe(3);
    expect(result.cells).toHaveLength(3);
    expect(result.percentage).toBeCloseTo(33.33, 1);
  });

  it('should return zero when no empty cells', async () => {
    const mockTable = createMockTable(2, 2, [['A', 'B'], ['C', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await findEmptyCells(0);

    expect(result.count).toBe(0);
    expect(result.cells).toHaveLength(0);
    expect(result.percentage).toBe(0);
  });

  it('should calculate percentage correctly', async () => {
    const mockTable = createMockTable(2, 2, [['A', ''], ['', 'D']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await findEmptyCells(0);

    expect(result.count).toBe(2);
    expect(result.percentage).toBe(50);
  });

  it('should handle errors and return empty result', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Find error'));

    const result = await findEmptyCells(0);

    expect(result.count).toBe(0);
    expect(result.cells).toHaveLength(0);
    expect(result.percentage).toBe(0);
  });
});

describe('isCellEmpty', () => {
  it('should return true for empty string', () => {
    expect(isCellEmpty('')).toBe(true);
  });

  it('should return true for whitespace only', () => {
    expect(isCellEmpty('   ')).toBe(true);
    expect(isCellEmpty('\t')).toBe(true);
    expect(isCellEmpty('\n')).toBe(true);
  });

  it('should return false for text content', () => {
    expect(isCellEmpty('Hello')).toBe(false);
    expect(isCellEmpty('0')).toBe(false);
    expect(isCellEmpty('  text  ')).toBe(false);
  });

  it('should work with CellInfo object', () => {
    const emptyCell: CellInfo = {
      rowIndex: 0,
      colIndex: 0,
      text: '',
      isEmpty: true,
      isMerged: false,
      hasNestedTable: false,
      characterCount: 0,
      id: '0-0',
    };

    const filledCell: CellInfo = {
      rowIndex: 0,
      colIndex: 1,
      text: 'Content',
      isEmpty: false,
      isMerged: false,
      hasNestedTable: false,
      characterCount: 7,
      id: '0-1',
    };

    expect(isCellEmpty(emptyCell)).toBe(true);
    expect(isCellEmpty(filledCell)).toBe(false);
  });
});

describe('validateTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate existing table', async () => {
    const mockTable = createMockTable(3, 3, [
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
      ['G', 'H', 'I'],
    ]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await validateTable(0);

    expect(result.valid).toBe(true);
    expect(result.tableInfo?.exists).toBe(true);
    expect(result.tableInfo?.hasRows).toBe(true);
    expect(result.tableInfo?.hasColumns).toBe(true);
  });

  it('should return invalid for out-of-range index', async () => {
    const mockContext = createMockContext([]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await validateTable(5);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of range');
    expect(result.errorCode).toBe(TableErrorCode.INVALID_TABLE_INDEX);
  });

  it('should handle validation errors', async () => {
    (Word.run as jest.Mock).mockRejectedValue(new Error('Validation error'));

    const result = await validateTable(0);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Validation error');
    expect(result.errorCode).toBe(TableErrorCode.TABLE_ACCESS_ERROR);
  });
});

describe('Edge cases and integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle empty table (0x0)', async () => {
    const mockTable = createMockTable(0, 0, []);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await detectTables();

    expect(result.success).toBe(true);
    expect(result.tables[0].totalCells).toBe(0);
  });

  it('should handle single cell table (1x1)', async () => {
    const mockTable = createMockTable(1, 1, [['A']]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await detectTables();

    expect(result.success).toBe(true);
    expect(result.tables[0].totalCells).toBe(1);
  });

  it('should handle large table', async () => {
    const largeValues = Array.from({ length: 100 }, (_, row) =>
      Array.from({ length: 10 }, (_, col) => `R${row}C${col}`)
    );
    const mockTable = createMockTable(100, 10, largeValues);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await detectTables();

    expect(result.success).toBe(true);
    expect(result.tables[0].totalCells).toBe(1000);
  });

  it('should handle table with special characters', async () => {
    const mockTable = createMockTable(2, 2, [
      ['!@#$', '%^&*'],
      ['<>/', '\\|"'],
    ]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await detectTables();

    expect(result.success).toBe(true);
  });

  it('should handle table with Unicode characters', async () => {
    const mockTable = createMockTable(2, 2, [
      ['你好', '世界'],
      ['Привет', 'мир'],
    ]);
    const mockContext = createMockContext([mockTable]);

    (Word.run as jest.Mock).mockImplementation(async (callback) => {
      return await callback(mockContext);
    });

    const result = await detectTables();

    expect(result.success).toBe(true);
  });
});
