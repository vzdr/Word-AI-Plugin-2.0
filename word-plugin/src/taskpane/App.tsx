import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import './App.css';
import InlineContext from './components/InlineContext';
import FileUpload, { UploadedFile } from './components/FileUpload';
import Settings, { SettingsValues } from './components/Settings';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorDisplay, { ErrorSeverity } from './components/ErrorDisplay';
import OfflineIndicator from '../components/OfflineIndicator';
import TablePreview from './components/TablePreview';
import CellFillOptions from './components/CellFillOptions';
import {
  getTextSelection,
  SelectionLocation
} from '../utils/textSelection';
import { replaceSelectedText } from '../utils/textReplacement';
import {
  askAI,
  isAIServiceError,
  getUserFriendlyErrorMessage,
  AIServiceErrorType
} from '../services/aiService';
import { useAsyncWithRetry } from '../hooks/useAsync';
import { logger, logUserAction, logAsyncOperation } from '../utils/logger';
import {
  detectTables,
  parseTableStructure,
} from '../utils/tableDetection';
import {
  fillEmptyCells,
  previewFillChanges,
  FillStrategy,
  CellUpdate as TableCellUpdate,
} from '../utils/tableFiller';
import {
  TableInfo,
  TableStructure,
  AutoFillOptions,
  DEFAULT_AUTOFILL_OPTIONS,
} from '../types/table';
import { CellUpdate } from './components/TablePreview';

interface AppState {
  selectedText: string;
  selectionLocation: SelectionLocation;
  selectionParagraphCount: number;
  selectionError: string | null;
  error: string | null;
  errorSeverity: ErrorSeverity;
  aiResponse: string | null;
  inlineContext: string;
  uploadedFiles: UploadedFile[];
  fileUploadError: string | null;
  settings: SettingsValues;
}

// Default settings
const DEFAULT_SETTINGS: SettingsValues = {
  model: 'gemini-2.5-pro',
  temperature: 0.7,
  maxTokens: 2000
};

const App: React.FC = () => {
  // Component mount/unmount logging
  useEffect(() => {
    logger.debug('App component mounted');
    return () => {
      logger.debug('App component unmounting');
    };
  }, []);

  // State management
  const [selectedText, setSelectedText] = useState('');
  const [selectionLocation, setSelectionLocation] = useState<SelectionLocation>('body');
  const [selectionParagraphCount, setSelectionParagraphCount] = useState(0);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSeverity, setErrorSeverity] = useState<ErrorSeverity>('error');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [inlineContext, setInlineContext] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsValues>(DEFAULT_SETTINGS);
  const [isReplacingText, setIsReplacingText] = useState(false);

  // Table mode state
  const [tableMode, setTableMode] = useState(false);
  const [detectedTables, setDetectedTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [tableStructure, setTableStructure] = useState<TableStructure | null>(null);
  const [tableFillPreview, setTableFillPreview] = useState<CellUpdate[] | null>(null);
  const [fillOptions, setFillOptions] = useState<AutoFillOptions>(DEFAULT_AUTOFILL_OPTIONS);
  const [isDetectingTables, setIsDetectingTables] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isFillingCells, setIsFillingCells] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // AI query with retry using useAsyncWithRetry hook
  const {
    data: aiData,
    loading: aiLoading,
    error: aiError,
    execute: executeAI,
    retryCount,
    maxRetries,
    isRetrying
  } = useAsyncWithRetry(
    async () => {
      logAsyncOperation.start('AI query', {
        selectedTextLength: selectedText.length,
        inlineContextLength: inlineContext.length,
        fileCount: uploadedFiles.length,
        settings
      });

      const response = await askAI(
        selectedText,
        inlineContext,
        uploadedFiles,
        settings
      );

      logAsyncOperation.success('AI query', {
        responseLength: response.response.length
      });

      return response.response;
    },
    { maxAttempts: 3 },
    {
      onSuccess: (response) => {
        setAiResponse(response);
        setError(null);
        logger.info('AI response received successfully', {
          responseLength: response.length
        });
      },
      onError: (err) => {
        logAsyncOperation.failure('AI query', err, {
          selectedTextLength: selectedText.length
        });

        // Determine error severity
        let severity: ErrorSeverity = 'error';
        let errorMessage: string;

        if (isAIServiceError(err)) {
          errorMessage = getUserFriendlyErrorMessage(err);

          // Service unavailable is more of a warning (user can retry)
          if (err.type === AIServiceErrorType.SERVICE_UNAVAILABLE) {
            severity = 'warning';
          }
          // Network/timeout errors are also warnings (temporary issues)
          else if (
            err.type === AIServiceErrorType.NETWORK_ERROR ||
            err.type === AIServiceErrorType.TIMEOUT
          ) {
            severity = 'warning';
          }
                                } else {
                                  errorMessage = err instanceof Error ? err.message : String(err);
                                }        // Ensure errorMessage is always a string
        const finalErrorMessage = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
        setError(finalErrorMessage);
        setErrorSeverity(severity);
      }
    }
  );

  const getSelectedText = useCallback(async () => {
    logUserAction('Get selection button clicked');
    setSelectionError(null);

    try {
      logAsyncOperation.start('Get text selection');
      const selectionInfo = await getTextSelection();

      if (!selectionInfo.isValid) {
        logger.warn('Invalid text selection', {
          error: selectionInfo.error,
          location: selectionInfo.location
        });
        setSelectionError(selectionInfo.error || 'Invalid selection');
        setSelectedText('');
        setSelectionLocation(selectionInfo.location);
        setSelectionParagraphCount(0);
        return;
      }

      logAsyncOperation.success('Get text selection', {
        textLength: selectionInfo.text.length,
        location: selectionInfo.location,
        paragraphCount: selectionInfo.paragraphCount
      });

      setSelectedText(selectionInfo.text);
      setSelectionLocation(selectionInfo.location);
      setSelectionParagraphCount(selectionInfo.paragraphCount);
      setSelectionError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get selection');
      logAsyncOperation.failure('Get text selection', error);
      setSelectionError(error.message);
      setSelectedText('');
      setSelectionLocation('unknown');
      setSelectionParagraphCount(0);
    }
  }, []);

  const handleInlineContextChange = useCallback((value: string) => {
    logger.debug('Inline context changed', { length: value.length });
    setInlineContext(value);
  }, []);

  const handleFilesChange = useCallback((files: UploadedFile[]) => {
    logger.info('Files changed', { fileCount: files.length });
    setUploadedFiles(files);
    setFileUploadError(null);
  }, []);

  const handleFileUploadError = useCallback((error: string) => {
    logger.error('File upload error', new Error(error));
    setFileUploadError(error);
  }, []);

  const handleSettingsChange = useCallback((newSettings: SettingsValues) => {
    logger.info('Settings changed', newSettings);
    setSettings(newSettings);
  }, []);

  const handleSettingsReset = useCallback(() => {
    logUserAction('Settings reset to defaults');
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const handleAskAI = useCallback(async () => {
    logUserAction('Ask AI button clicked');

    // Validate we have selected text
    if (!selectedText || selectedText.trim().length === 0) {
      logger.warn('Ask AI attempted without selected text');
      setError('Please select text in the document first');
      setErrorSeverity('warning');
      return;
    }

    // Clear previous error and response
    setError(null);
    setAiResponse(null);

    // Execute AI query with retry
    await executeAI();
  }, [selectedText, executeAI]);

  const handleReplaceText = useCallback(async () => {
    logUserAction('Replace text button clicked');

    if (!aiResponse) {
      logger.warn('Replace text attempted without AI response');
      setError('No AI response available to replace');
      setErrorSeverity('warning');
      return;
    }

    // Validate that we still have selected text
    if (!selectedText) {
      logger.warn('Replace text attempted without selected text');
      setError('Please select text in the document first');
      setErrorSeverity('warning');
      return;
    }

    setIsReplacingText(true);
    setError(null);

    try {
      logAsyncOperation.start('Replace text in document', {
        originalLength: selectedText.length,
        newLength: aiResponse.length
      });

      // Perform text replacement with formatting preservation
      const result = await replaceSelectedText(aiResponse, {
        preserveFormatting: true,
        validateSelection: true,
        selectAfterReplace: false,
      });

      if (!result.success) {
        // Replacement failed - show error
        logAsyncOperation.failure(
          'Replace text in document',
          new Error(result.error || 'Failed to replace text')
        );
        setError(result.error || 'Failed to replace text in document');
        setErrorSeverity('error');
        setIsReplacingText(false);
        return;
      }

      logAsyncOperation.success('Replace text in document', {
        originalLength: result.originalLength,
        newLength: result.newLength
      });

      // Success! Clear states and show brief success message
      setAiResponse(null);
      setSelectedText(''); // Clear selection as it's been replaced
      setError(null);
      setIsReplacingText(false);

      // Show temporary success notification
      setTimeout(() => {
        setError(`Successfully replaced ${result.originalLength} characters with ${result.newLength} characters`);
        setErrorSeverity('info');

        // Clear success message after 3 seconds
        setTimeout(() => {
          setError(null);
        }, 3000);
      }, 100);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to replace text');
      logAsyncOperation.failure('Replace text in document', error);
      setError(error.message);
      setErrorSeverity('error');
      setIsReplacingText(false);
    }
  }, [aiResponse, selectedText]);

  const clearError = useCallback(() => {
    logger.debug('Error cleared by user');
    setError(null);
  }, []);

  const getLocationBadgeClass = (location: SelectionLocation): string => {
    const baseClass = 'location-badge';
    switch (location) {
      case 'header':
      case 'footer':
        return `${baseClass} location-special`;
      case 'table':
        return `${baseClass} location-table`;
      case 'textBox':
        return `${baseClass} location-textbox`;
      case 'unknown':
        return `${baseClass} location-unknown`;
      default:
        return baseClass;
    }
  };

  // Table mode handlers
  const handleDetectTables = useCallback(async () => {
    logUserAction('Detect tables button clicked');
    setIsDetectingTables(true);
    setTableError(null);

    try {
      logAsyncOperation.start('Detect tables in document');
      const result = await detectTables({
        includeHeaders: true,
        includeFooters: true,
        includeNested: false,
        parseStructure: true,
      });

      if (!result.success || result.count === 0) {
        logger.warn('No tables found in document');
        setTableError('No tables found in document. Please add a table and try again.');
        setDetectedTables([]);
        logAsyncOperation.failure('Detect tables in document', new Error('No tables found'));
        return;
      }

      logAsyncOperation.success('Detect tables in document', {
        tableCount: result.count,
      });

      setDetectedTables(result.tables);
      logger.info('Tables detected successfully', { count: result.count });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to detect tables');
      logAsyncOperation.failure('Detect tables in document', error);
      setTableError(error.message);
      setDetectedTables([]);
    } finally {
      setIsDetectingTables(false);
    }
  }, []);

  const handleSelectTable = useCallback(async (tableIndex: number) => {
    logUserAction('Table selected', { tableIndex });
    setTableError(null);

    try {
      const table = detectedTables[tableIndex];
      if (!table) {
        setTableError('Invalid table selection');
        return;
      }

      setSelectedTable(table);

      // Parse table structure
      logAsyncOperation.start('Parse table structure');
      const parseResult = await parseTableStructure(table.index, false);

      if (!parseResult.success || !parseResult.structure) {
        logAsyncOperation.failure(
          'Parse table structure',
          new Error(parseResult.error || 'Failed to parse table')
        );
        setTableError(parseResult.error || 'Failed to parse table structure');
        return;
      }

      logAsyncOperation.success('Parse table structure', {
        rowCount: parseResult.structure.info.rowCount,
        columnCount: parseResult.structure.info.columnCount,
      });

      setTableStructure(parseResult.structure);
      setTableFillPreview(null); // Clear any existing preview
      logger.info('Table structure parsed', {
        rows: parseResult.structure.info.rowCount,
        columns: parseResult.structure.info.columnCount,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to select table');
      logAsyncOperation.failure('Parse table structure', error);
      setTableError(error.message);
    }
  }, [detectedTables]);

  const handleGeneratePreview = useCallback(async () => {
    logUserAction('Generate preview button clicked');

    if (!selectedTable || !tableStructure) {
      logger.warn('Generate preview attempted without selected table');
      setTableError('Please select a table first');
      return;
    }

    setIsGeneratingPreview(true);
    setTableError(null);

    try {
      logAsyncOperation.start('Generate table fill preview', {
        tableIndex: selectedTable.index,
        strategy: fillOptions.fillStrategy,
      });

      // Determine strategy from fillOptions
      const strategy: FillStrategy =
        fillOptions.fillStrategy === 'row-by-row'
          ? 'CONTEXTUAL'
          : fillOptions.fillStrategy === 'all-at-once'
          ? 'BATCH'
          : 'SELECTIVE';

      // Generate preview
      const preview = await previewFillChanges(
        selectedTable.index,
        strategy,
        fillOptions,
        false // Don't generate sample content yet
      );

      if (!preview || preview.count === 0) {
        logger.warn('No empty cells to fill in selected table');
        setTableError('No empty cells found in the selected table');
        logAsyncOperation.failure(
          'Generate table fill preview',
          new Error('No empty cells found')
        );
        return;
      }

      logAsyncOperation.success('Generate table fill preview', {
        cellCount: preview.count,
        percentage: preview.percentage,
      });

      // Convert preview cells to CellUpdate format
      const cellUpdates: CellUpdate[] = preview.cellsToFill.map((cell) => ({
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        newValue: '(AI will generate content)',
        isEnabled: true,
      }));

      setTableFillPreview(cellUpdates);
      logger.info('Preview generated', {
        cellsToFill: preview.count,
        percentage: preview.percentage,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate preview');
      logAsyncOperation.failure('Generate table fill preview', error);
      setTableError(error.message);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [selectedTable, tableStructure, fillOptions]);

  const handleConfirmFill = useCallback(async () => {
    logUserAction('Confirm fill button clicked');

    if (!selectedTable || !tableFillPreview) {
      logger.warn('Confirm fill attempted without preview');
      setTableError('Please generate a preview first');
      return;
    }

    setIsFillingCells(true);
    setTableError(null);

    try {
      logAsyncOperation.start('Fill table cells with AI', {
        tableIndex: selectedTable.index,
        cellCount: tableFillPreview.filter((u) => u.isEnabled).length,
      });

      // Determine strategy
      const strategy: FillStrategy =
        fillOptions.fillStrategy === 'row-by-row'
          ? 'CONTEXTUAL'
          : fillOptions.fillStrategy === 'all-at-once'
          ? 'BATCH'
          : 'SELECTIVE';

      // Fill the cells
      const result = await fillEmptyCells(
        selectedTable.index,
        strategy,
        settings,
        {
          ...fillOptions,
          context: inlineContext,
        }
      );

      if (!result.success) {
        logAsyncOperation.failure(
          'Fill table cells with AI',
          new Error(result.error || 'Failed to fill cells')
        );
        setTableError(result.error || 'Failed to fill table cells');
        return;
      }

      logAsyncOperation.success('Fill table cells with AI', {
        filledCount: result.filledCount,
        failedCount: result.failedCount,
        totalAttempted: result.totalAttempted,
      });

      // Success!
      setTableFillPreview(null);
      setSelectedTable(null);
      setTableStructure(null);

      // Show success message
      setTimeout(() => {
        setError(
          `Successfully filled ${result.filledCount} cell${result.filledCount !== 1 ? 's' : ''}` +
            (result.failedCount > 0 ? ` (${result.failedCount} failed)` : '')
        );
        setErrorSeverity('info');

        setTimeout(() => {
          setError(null);
        }, 5000);
      }, 100);

      logger.info('Table cells filled successfully', {
        filledCount: result.filledCount,
        failedCount: result.failedCount,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fill cells');
      logAsyncOperation.failure('Fill table cells with AI', error);
      setTableError(error.message);
    } finally {
      setIsFillingCells(false);
    }
  }, [selectedTable, tableFillPreview, fillOptions, settings, inlineContext]);

  const handleCancelFill = useCallback(() => {
    logUserAction('Cancel fill button clicked');
    setTableFillPreview(null);
    logger.debug('Table fill preview cancelled');
  }, []);

  const handleCellToggle = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (!tableFillPreview) return;

      const updatedPreview = tableFillPreview.map((update) => {
        if (update.rowIndex === rowIndex && update.colIndex === colIndex) {
          return { ...update, isEnabled: !update.isEnabled };
        }
        return update;
      });

      setTableFillPreview(updatedPreview);
      logger.debug('Cell toggle', { rowIndex, colIndex });
    },
    [tableFillPreview]
  );

  const handleModeToggle = useCallback(() => {
    const newMode = !tableMode;
    logUserAction('Mode toggle', { newMode: newMode ? 'table' : 'text' });
    setTableMode(newMode);

    // Clear table-specific state when switching modes
    if (!newMode) {
      setDetectedTables([]);
      setSelectedTable(null);
      setTableStructure(null);
      setTableFillPreview(null);
      setTableError(null);
    } else {
      // Clear text mode state when switching to table mode
      setSelectedText('');
      setAiResponse(null);
      setError(null);
    }

    logger.info('Mode switched', { mode: newMode ? 'table' : 'text' });
  }, [tableMode]);

  const isProcessing = aiLoading || isReplacingText || isDetectingTables || isGeneratingPreview || isFillingCells;
  const processingMessage = aiLoading
    ? 'Sending request to AI service...'
    : isReplacingText
    ? 'Replacing text in document...'
    : isDetectingTables
    ? 'Detecting tables in document...'
    : isGeneratingPreview
    ? 'Generating preview...'
    : isFillingCells
    ? 'Filling table cells with AI...'
    : '';

  return (
    <div className="app-container">
      {/* Global offline indicator */}
      <OfflineIndicator position="top" />

      <header className="app-header">
        <h1>Word AI Plugin</h1>
        <p>AI-powered context-based text completion</p>
      </header>

      <main className="app-main">
        {/* Mode Toggle */}
        <section className="mode-toggle-section">
          <div className="mode-toggle">
            <button
              onClick={handleModeToggle}
              className={!tableMode ? 'mode-btn mode-active' : 'mode-btn'}
              disabled={isProcessing}
            >
              Text Mode
            </button>
            <button
              onClick={handleModeToggle}
              className={tableMode ? 'mode-btn mode-active' : 'mode-btn'}
              disabled={isProcessing}
            >
              Table Mode
            </button>
          </div>
        </section>

        {/* Text Mode UI */}
        {!tableMode && (
          <>
            <section className="selection-section">
          <h2>Selected Text</h2>

          <button onClick={getSelectedText} className="get-selection-btn">
            Get Selection
          </button>

          {selectionError && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {selectionError}
            </div>
          )}

          {selectedText && (
            <>
              <div className="selection-metadata">
                <span className={getLocationBadgeClass(selectionLocation)}>
                  {selectionLocation}
                </span>
                <span className="paragraph-count">
                  {selectionParagraphCount} paragraph{selectionParagraphCount !== 1 ? 's' : ''}
                </span>
                <span className="character-count">
                  {selectedText.length} chars
                </span>
              </div>
              <div className="selected-text">
                <pre>{selectedText}</pre>
              </div>
            </>
          )}
        </section>

        <section className="context-section">
          <h2>Context</h2>
          <InlineContext
            value={inlineContext}
            onChange={handleInlineContextChange}
            placeholder="Enter context here... (e.g., documentation, instructions, or reference material)"
            maxLength={10000}
          />

          <div className="context-divider">
            <span>OR</span>
          </div>

          <FileUpload
            files={uploadedFiles}
            onFilesChange={handleFilesChange}
            onError={handleFileUploadError}
          />

          {fileUploadError && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {fileUploadError}
            </div>
          )}
        </section>

        <section className="settings-section">
          <h2>Settings</h2>
          <Settings
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onReset={handleSettingsReset}
          />
        </section>

        <section className="actions-section">
          <h2>Actions</h2>

          {/* Global error display */}
          {error && (
            <ErrorDisplay
              error={error}
              severity={errorSeverity}
              onDismiss={clearError}
              onRetry={aiResponse ? undefined : handleAskAI}
              retryAttempt={retryCount > 0 ? retryCount : undefined}
              maxRetries={retryCount > 0 ? maxRetries : undefined}
            />
          )}

          {/* Loading indicator with retry information */}
          {isProcessing && (
            <LoadingIndicator
              message={processingMessage}
              retryCount={isRetrying ? retryCount : undefined}
              maxRetries={isRetrying ? maxRetries : undefined}
            />
          )}

          {/* AI Response success state */}
          {aiResponse && !isProcessing && (
            <div className="success-state">
              <div className="success-header">
                <span className="success-icon">✓</span>
                <h3>AI Response Ready</h3>
              </div>
              <div className="success-content">
                <pre className="ai-response">{aiResponse}</pre>
              </div>
              <div className="success-actions">
                <button
                  onClick={handleReplaceText}
                  className="primary-button"
                  disabled={isProcessing}
                >
                  Replace Selected Text
                </button>
                <button
                  onClick={() => {
                    logUserAction('Cancel AI response');
                    setAiResponse(null);
                  }}
                  className="secondary-button"
                  disabled={isProcessing}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Ask AI button - only show when not processing and no response */}
          {!aiResponse && !isProcessing && (
            <button
              onClick={handleAskAI}
              disabled={!selectedText || isProcessing}
              className="primary-button"
            >
              Ask AI
            </button>
          )}
        </section>
          </>
        )}

        {/* Table Mode UI */}
        {tableMode && (
          <>
            <section className="table-detection-section">
              <h2>Table Detection</h2>

              <button
                onClick={handleDetectTables}
                className="get-selection-btn"
                disabled={isProcessing}
              >
                Detect Tables
              </button>

              {tableError && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {tableError}
                </div>
              )}

              {detectedTables.length > 0 && (
                <div className="detected-tables">
                  <h3>Found {detectedTables.length} table{detectedTables.length !== 1 ? 's' : ''}</h3>
                  <div className="table-list">
                    {detectedTables.map((table, idx) => (
                      <div
                        key={table.id}
                        className={`table-item ${selectedTable?.id === table.id ? 'table-selected' : ''}`}
                        onClick={() => !isProcessing && handleSelectTable(idx)}
                      >
                        <div className="table-info">
                          <span className="table-label">Table {idx + 1}</span>
                          <span className="table-meta">
                            {table.rowCount} x {table.columnCount}
                          </span>
                          {table.emptyCellCount !== undefined && (
                            <span className="table-empty">
                              {table.emptyCellCount} empty
                            </span>
                          )}
                        </div>
                        <div className="table-location">{table.location}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {selectedTable && tableStructure && (
              <section className="context-section">
                <h2>Context (Optional)</h2>
                <InlineContext
                  value={inlineContext}
                  onChange={handleInlineContextChange}
                  placeholder="Enter context for AI generation... (e.g., instructions about what type of content to generate)"
                  maxLength={10000}
                />
              </section>
            )}

            {selectedTable && tableStructure && !tableFillPreview && (
              <section className="fill-options-section">
                <h2>Fill Options</h2>
                <CellFillOptions
                  options={fillOptions}
                  onChange={setFillOptions}
                  onConfirm={handleGeneratePreview}
                  onCancel={() => {
                    setSelectedTable(null);
                    setTableStructure(null);
                  }}
                  confirmDisabled={isProcessing}
                  isLoading={isGeneratingPreview}
                />
              </section>
            )}

            {tableFillPreview && tableStructure && (
              <section className="preview-section">
                <h2>Preview Changes</h2>
                <TablePreview
                  tableStructure={tableStructure}
                  cellUpdates={tableFillPreview}
                  onCellToggle={handleCellToggle}
                  showStatistics={true}
                  maxVisibleRows={10}
                />

                <div className="preview-actions">
                  <button
                    onClick={handleConfirmFill}
                    className="primary-button"
                    disabled={isProcessing || tableFillPreview.filter(u => u.isEnabled).length === 0}
                  >
                    {isFillingCells ? 'Filling...' : 'Confirm and Fill'}
                  </button>
                  <button
                    onClick={handleCancelFill}
                    className="secondary-button"
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            )}

            <section className="settings-section">
              <h2>Settings</h2>
              <Settings
                settings={settings}
                onSettingsChange={handleSettingsChange}
                onReset={handleSettingsReset}
              />
            </section>

            <section className="actions-section">
              <h2>Status</h2>

              {/* Global error display */}
              {error && (
                <ErrorDisplay
                  error={error}
                  severity={errorSeverity}
                  onDismiss={clearError}
                />
              )}

              {/* Loading indicator */}
              {isProcessing && (
                <LoadingIndicator
                  message={processingMessage}
                />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default App;
