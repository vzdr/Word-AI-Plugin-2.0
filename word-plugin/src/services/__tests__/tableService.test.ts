/**
 * Comprehensive tests for tableService.ts
 *
 * Tests table service for AI integration with comprehensive scenarios:
 * - Single cell content generation
 * - Batch cell generation
 * - Table purpose inference
 * - Sample data extraction
 * - Context building for AI prompts
 * - Error handling
 */

import {
  generateCellContent,
  generateBatchCellContent,
  inferTablePurpose,
  extractSampleData,
  CellContext,
  TableContext,
  CellGenerationResult,
  BatchCellGenerationResult,
} from '../tableService';
import * as aiService from '../aiService';
import { SettingsValues } from '../../taskpane/components/Settings';
import { TableStructure, CellInfo } from '../../types/table';

// Mock aiService
jest.mock('../aiService');

describe('tableService', () => {
  const mockSettings: SettingsValues = {
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCellContent', () => {
    const mockCellContext: CellContext = {
      rowIndex: 1,
      colIndex: 1,
      columnHeader: 'Age',
      rowContext: ['John Doe', '30', 'New York'],
      columnContext: ['25', '32', '28'],
      adjacentCells: {
        left: 'John Doe',
        right: 'New York',
        top: 'Age',
        bottom: '32',
      },
    };

    const mockTableContext: TableContext = {
      rowCount: 5,
      columnCount: 3,
      headers: ['Name', 'Age', 'City'],
      purpose: 'Employee directory',
      sampleData: [
        ['Jane Smith', '25', 'Los Angeles'],
        ['Bob Johnson', '32', 'Chicago'],
      ],
    };

    it('should generate cell content successfully', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: '30',
        model: 'gpt-3.5-turbo',
        usage: {
          promptTokens: 50,
          completionTokens: 5,
          totalTokens: 55,
        },
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.content).toBe('30');
      expect(result.rowIndex).toBe(1);
      expect(result.colIndex).toBe(1);
      expect(result.usage).toEqual(mockResponse.usage);
    });

    it('should trim whitespace from generated content', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: '  trimmed content  \n',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      expect(result.content).toBe('trimmed content');
    });

    it('should include user context in AI request', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings,
        'Fill with sample data'
      );

      expect(aiService.askAI).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Fill with sample data'),
        [],
        mockSettings
      );
    });

    it('should build proper prompt with all context', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      const aiCall = (aiService.askAI as jest.Mock).mock.calls[0];
      const prompt = aiCall[1]; // Second argument is context/prompt

      expect(prompt).toContain('Table Structure');
      expect(prompt).toContain('5 rows x 3 columns');
      expect(prompt).toContain('Table Purpose: Employee directory');
      expect(prompt).toContain('Column: Age');
      expect(prompt).toContain('Row 2, Column 2');
    });

    it('should include adjacent cells in prompt', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      const aiCall = (aiService.askAI as jest.Mock).mock.calls[0];
      const prompt = aiCall[1];

      expect(prompt).toContain('Adjacent cells');
      expect(prompt).toContain('Left: "John Doe"');
      expect(prompt).toContain('Right: "New York"');
    });

    it('should handle error from AI service', async () => {
      const mockError: aiService.AIServiceError = {
        message: 'AI service error',
        type: aiService.AIServiceErrorType.NETWORK_ERROR,
      };

      (aiService.askAI as jest.Mock).mockRejectedValueOnce(mockError);
      (aiService.isAIServiceError as jest.Mock).mockReturnValueOnce(true);

      const result = await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI service error');
      expect(result.rowIndex).toBe(1);
      expect(result.colIndex).toBe(1);
    });

    it('should handle generic errors', async () => {
      (aiService.askAI as jest.Mock).mockRejectedValueOnce(
        new Error('Generic error')
      );
      (aiService.isAIServiceError as jest.Mock).mockReturnValueOnce(false);

      const result = await generateCellContent(
        mockCellContext,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generic error');
    });

    it('should handle context without headers', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      const contextNoHeaders = { ...mockCellContext, columnHeader: undefined };
      const tableNoHeaders = { ...mockTableContext, headers: undefined };

      await generateCellContent(contextNoHeaders, tableNoHeaders, mockSettings);

      const aiCall = (aiService.askAI as jest.Mock).mock.calls[0];
      const prompt = aiCall[1];

      expect(prompt).not.toContain('Column:');
    });

    it('should handle empty row context', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValueOnce(mockResponse);

      const contextEmptyRow = { ...mockCellContext, rowContext: [] };

      await generateCellContent(contextEmptyRow, mockTableContext, mockSettings);

      const result = (aiService.askAI as jest.Mock).mock.calls[0];
      expect(result).toBeDefined();
    });
  });

  describe('generateBatchCellContent', () => {
    const mockCells: CellContext[] = [
      {
        rowIndex: 1,
        colIndex: 1,
        columnHeader: 'Age',
        rowContext: ['John', '25'],
        columnContext: ['30', '32'],
        adjacentCells: { left: 'John' },
      },
      {
        rowIndex: 2,
        colIndex: 1,
        columnHeader: 'Age',
        rowContext: ['Jane', '28'],
        columnContext: ['30', '32'],
        adjacentCells: { left: 'Jane' },
      },
    ];

    const mockTableContext: TableContext = {
      rowCount: 5,
      columnCount: 3,
      headers: ['Name', 'Age', 'City'],
    };

    it('should generate content for multiple cells', async () => {
      const mockResponses: aiService.AIQueryResponse[] = [
        { response: '25', model: 'gpt-3.5-turbo', usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } },
        { response: '28', model: 'gpt-3.5-turbo', usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } },
      ];

      (aiService.askAI as jest.Mock)
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await generateBatchCellContent(
        mockCells,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.totalUsage?.totalTokens).toBe(24);
    });

    it('should handle partial failures', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: '25',
        model: 'gpt-3.5-turbo',
        usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      };

      (aiService.askAI as jest.Mock)
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValueOnce(new Error('Failed'));

      (aiService.isAIServiceError as jest.Mock).mockReturnValue(false);

      const result = await generateBatchCellContent(
        mockCells,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
    });

    it('should process cells in batches', async () => {
      const manyCells: CellContext[] = Array.from({ length: 25 }, (_, i) => ({
        rowIndex: i,
        colIndex: 0,
        columnHeader: 'Test',
        rowContext: [],
        columnContext: [],
        adjacentCells: {},
      }));

      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValue(mockResponse);

      const result = await generateBatchCellContent(
        manyCells,
        mockTableContext,
        mockSettings,
        undefined,
        10 // Batch size
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(25);
      expect(result.successCount).toBe(25);
    });

    it('should aggregate token usage correctly', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };

      (aiService.askAI as jest.Mock).mockResolvedValue(mockResponse);

      const result = await generateBatchCellContent(
        mockCells,
        mockTableContext,
        mockSettings
      );

      expect(result.totalUsage).toBeDefined();
      expect(result.totalUsage?.promptTokens).toBe(200);
      expect(result.totalUsage?.completionTokens).toBe(100);
      expect(result.totalUsage?.totalTokens).toBe(300);
    });

    it('should handle cells without usage data', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
        // No usage data
      };

      (aiService.askAI as jest.Mock).mockResolvedValue(mockResponse);

      const result = await generateBatchCellContent(
        mockCells,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.totalUsage).toBeUndefined();
    });

    it('should handle empty cells array', async () => {
      const result = await generateBatchCellContent(
        [],
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });

    it('should include user context', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock).mockResolvedValue(mockResponse);

      await generateBatchCellContent(
        [mockCells[0]],
        mockTableContext,
        mockSettings,
        'User context'
      );

      expect(aiService.askAI).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('User context'),
        [],
        mockSettings
      );
    });

    it('should handle catastrophic batch failure', async () => {
      const mockResponse: aiService.AIQueryResponse = {
        response: 'Generated',
        model: 'gpt-3.5-turbo',
      };

      (aiService.askAI as jest.Mock)
        .mockResolvedValueOnce(mockResponse)
        .mockRejectedValue(new Error('All failed'));

      (aiService.isAIServiceError as jest.Mock).mockReturnValue(false);

      const result = await generateBatchCellContent(
        mockCells,
        mockTableContext,
        mockSettings
      );

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
    });
  });

  describe('inferTablePurpose', () => {
    it('should infer purpose from headers', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 5,
          columnCount: 3,
          hasHeaders: true,
          location: 'body',
          isNested: false,
          totalCells: 15,
          hasMergedCells: false,
          index: 0,
        },
        headers: ['Name', 'Age', 'City'],
        cells: [],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const purpose = inferTablePurpose(mockStructure);

      expect(purpose).toBe('Table with columns: Name, Age, City');
    });

    it('should handle empty headers array', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 3,
          columnCount: 2,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 6,
          hasMergedCells: false,
          index: 0,
        },
        headers: [],
        cells: [
          [
            { rowIndex: 0, colIndex: 0, text: 'Data1', isEmpty: false, isMerged: false, hasNestedTable: false, characterCount: 5, id: '0-0' },
            { rowIndex: 0, colIndex: 1, text: 'Data2', isEmpty: false, isMerged: false, hasNestedTable: false, characterCount: 5, id: '0-1' },
          ],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const purpose = inferTablePurpose(mockStructure);

      expect(purpose).toBe('Table with data including: Data1, Data2');
    });

    it('should infer from first row when no headers', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 3,
          columnCount: 2,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 6,
          hasMergedCells: false,
          index: 0,
        },
        headers: undefined,
        cells: [
          [
            { rowIndex: 0, colIndex: 0, text: 'FirstCell', isEmpty: false, isMerged: false, hasNestedTable: false, characterCount: 9, id: '0-0' },
            { rowIndex: 0, colIndex: 1, text: 'SecondCell', isEmpty: false, isMerged: false, hasNestedTable: false, characterCount: 10, id: '0-1' },
          ],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const purpose = inferTablePurpose(mockStructure);

      expect(purpose).toBe('Table with data including: FirstCell, SecondCell');
    });

    it('should handle empty first row', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 3,
          columnCount: 2,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 6,
          hasMergedCells: false,
          index: 0,
        },
        headers: undefined,
        cells: [
          [
            { rowIndex: 0, colIndex: 0, text: '', isEmpty: true, isMerged: false, hasNestedTable: false, characterCount: 0, id: '0-0' },
            { rowIndex: 0, colIndex: 1, text: '  ', isEmpty: true, isMerged: false, hasNestedTable: false, characterCount: 2, id: '0-1' },
          ],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const purpose = inferTablePurpose(mockStructure);

      expect(purpose).toBe('Data table');
    });

    it('should handle completely empty table', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 0,
          columnCount: 0,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 0,
          hasMergedCells: false,
          index: 0,
        },
        headers: undefined,
        cells: [],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const purpose = inferTablePurpose(mockStructure);

      expect(purpose).toBe('Data table');
    });
  });

  describe('extractSampleData', () => {
    const createMockCell = (text: string, isEmpty: boolean): CellInfo => ({
      rowIndex: 0,
      colIndex: 0,
      text,
      isEmpty,
      isMerged: false,
      hasNestedTable: false,
      characterCount: text.length,
      id: '0-0',
    });

    it('should extract sample data from table', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 5,
          columnCount: 3,
          hasHeaders: true,
          location: 'body',
          isNested: false,
          totalCells: 15,
          hasMergedCells: false,
          index: 0,
        },
        headers: ['Name', 'Age', 'City'],
        cells: [
          [createMockCell('Name', false), createMockCell('Age', false), createMockCell('City', false)],
          [createMockCell('John', false), createMockCell('30', false), createMockCell('NYC', false)],
          [createMockCell('Jane', false), createMockCell('25', false), createMockCell('LA', false)],
          [createMockCell('Bob', false), createMockCell('35', false), createMockCell('Chicago', false)],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure, 2);

      expect(samples).toHaveLength(2);
      expect(samples[0]).toEqual(['John', '30', 'NYC']);
      expect(samples[1]).toEqual(['Jane', '25', 'LA']);
    });

    it('should skip header row when hasHeaders is true', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 3,
          columnCount: 2,
          hasHeaders: true,
          location: 'body',
          isNested: false,
          totalCells: 6,
          hasMergedCells: false,
          index: 0,
        },
        cells: [
          [createMockCell('Header1', false), createMockCell('Header2', false)],
          [createMockCell('Data1', false), createMockCell('Data2', false)],
          [createMockCell('Data3', false), createMockCell('Data4', false)],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure, 2);

      expect(samples).toHaveLength(2);
      expect(samples[0]).toEqual(['Data1', 'Data2']);
      expect(samples[1]).toEqual(['Data3', 'Data4']);
    });

    it('should prioritize rows with most filled cells', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 4,
          columnCount: 3,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 12,
          hasMergedCells: false,
          index: 0,
        },
        cells: [
          [createMockCell('A', false), createMockCell('', true), createMockCell('', true)], // 1 filled
          [createMockCell('B', false), createMockCell('C', false), createMockCell('D', false)], // 3 filled
          [createMockCell('E', false), createMockCell('F', false), createMockCell('', true)], // 2 filled
          [createMockCell('', true), createMockCell('', true), createMockCell('', true)], // 0 filled
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure, 2);

      expect(samples).toHaveLength(2);
      expect(samples[0]).toEqual(['B', 'C', 'D']); // Row with 3 filled cells
      expect(samples[1]).toEqual(['E', 'F', '']); // Row with 2 filled cells
    });

    it('should handle empty cells in sample data', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 2,
          columnCount: 3,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 6,
          hasMergedCells: false,
          index: 0,
        },
        cells: [
          [createMockCell('A', false), createMockCell('', true), createMockCell('B', false)],
          [createMockCell('', true), createMockCell('C', false), createMockCell('', true)],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure);

      expect(samples[0]).toEqual(['A', '', 'B']);
      expect(samples[1]).toEqual(['', 'C', '']);
    });

    it('should respect maxSamples parameter', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 10,
          columnCount: 2,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 20,
          hasMergedCells: false,
          index: 0,
        },
        cells: Array.from({ length: 10 }, (_, i) => [
          createMockCell(`Data${i}`, false),
          createMockCell(`Data${i}`, false),
        ]),
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure, 3);

      expect(samples).toHaveLength(3);
    });

    it('should return empty array for table with only headers', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 1,
          columnCount: 3,
          hasHeaders: true,
          location: 'body',
          isNested: false,
          totalCells: 3,
          hasMergedCells: false,
          index: 0,
        },
        cells: [
          [createMockCell('Header1', false), createMockCell('Header2', false), createMockCell('Header3', false)],
        ],
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure, 3);

      expect(samples).toHaveLength(0);
    });

    it('should use default maxSamples of 3', () => {
      const mockStructure: TableStructure = {
        info: {
          id: 0,
          rowCount: 10,
          columnCount: 2,
          hasHeaders: false,
          location: 'body',
          isNested: false,
          totalCells: 20,
          hasMergedCells: false,
          index: 0,
        },
        cells: Array.from({ length: 10 }, (_, i) => [
          createMockCell(`Data${i}`, false),
          createMockCell(`Data${i}`, false),
        ]),
        cellsFlat: [],
        mergedCells: [],
        nestedTables: [],
      };

      const samples = extractSampleData(mockStructure);

      expect(samples).toHaveLength(3);
    });
  });
});
