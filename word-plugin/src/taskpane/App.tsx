import * as React from 'react';
import './App.css';
import InlineContext from './components/InlineContext';
import FileUpload, { UploadedFile } from './components/FileUpload';
import Settings, { SettingsValues } from './components/Settings';
import LoadingIndicator from './components/LoadingIndicator';
import ErrorDisplay, { ErrorSeverity } from './components/ErrorDisplay';
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

interface AppState {
  selectedText: string;
  selectionLocation: SelectionLocation;
  selectionParagraphCount: number;
  selectionError: string | null;
  isProcessing: boolean;
  processingMessage: string;
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
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2000
};

class App extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      selectedText: '',
      selectionLocation: 'body',
      selectionParagraphCount: 0,
      selectionError: null,
      isProcessing: false,
      processingMessage: '',
      error: null,
      errorSeverity: 'error',
      aiResponse: null,
      inlineContext: '',
      uploadedFiles: [],
      fileUploadError: null,
      settings: DEFAULT_SETTINGS
    };
  }

  getSelectedText = async () => {
    this.setState({ selectionError: null });

    try {
      const selectionInfo = await getTextSelection();

      if (!selectionInfo.isValid) {
        this.setState({
          selectionError: selectionInfo.error || 'Invalid selection',
          selectedText: '',
          selectionLocation: selectionInfo.location,
          selectionParagraphCount: 0
        });
        return;
      }

      this.setState({
        selectedText: selectionInfo.text,
        selectionLocation: selectionInfo.location,
        selectionParagraphCount: selectionInfo.paragraphCount,
        selectionError: null
      });
    } catch (error) {
      console.error('Error getting selection:', error);
      this.setState({
        selectionError: error instanceof Error ? error.message : 'Failed to get selection',
        selectedText: '',
        selectionLocation: 'unknown',
        selectionParagraphCount: 0
      });
    }
  };

  handleInlineContextChange = (value: string) => {
    this.setState({ inlineContext: value });
  };

  handleFilesChange = (files: UploadedFile[]) => {
    this.setState({ uploadedFiles: files, fileUploadError: null });
  };

  handleFileUploadError = (error: string) => {
    this.setState({ fileUploadError: error });
  };

  handleSettingsChange = (settings: SettingsValues) => {
    this.setState({ settings });
  };

  handleSettingsReset = () => {
    this.setState({ settings: DEFAULT_SETTINGS });
  };

  handleAskAI = async () => {
    // Validate we have selected text
    if (!this.state.selectedText || this.state.selectedText.trim().length === 0) {
      this.setState({
        error: 'Please select text in the document first',
        errorSeverity: 'warning'
      });
      return;
    }

    // Clear previous error and response
    this.setState({
      error: null,
      aiResponse: null,
      isProcessing: true,
      processingMessage: 'Sending request to AI service...'
    });

    try {
      // Call AI service with selected text, context, files, and settings
      const response = await askAI(
        this.state.selectedText,
        this.state.inlineContext,
        this.state.uploadedFiles,
        this.state.settings
      );

      // Success - store the AI response
      this.setState({
        isProcessing: false,
        aiResponse: response.response,
        processingMessage: '',
        error: null
      });
    } catch (error) {
      // Determine error severity based on error type
      let severity: ErrorSeverity = 'error';
      let errorMessage: string;

      if (isAIServiceError(error)) {
        errorMessage = getUserFriendlyErrorMessage(error);

        // Service unavailable is more of a warning (user can retry)
        if (error.type === AIServiceErrorType.SERVICE_UNAVAILABLE) {
          severity = 'warning';
        }
        // Network/timeout errors are also warnings (temporary issues)
        else if (
          error.type === AIServiceErrorType.NETWORK_ERROR ||
          error.type === AIServiceErrorType.TIMEOUT
        ) {
          severity = 'warning';
        }
      } else {
        errorMessage = error instanceof Error ? error.message : 'Failed to process AI request';
      }

      this.setState({
        isProcessing: false,
        processingMessage: '',
        error: errorMessage,
        errorSeverity: severity
      });
    }
  };

  handleReplaceText = async () => {
    if (!this.state.aiResponse) {
      this.setState({
        error: 'No AI response available to replace',
        errorSeverity: 'warning'
      });
      return;
    }

    // Validate that we still have selected text
    if (!this.state.selectedText) {
      this.setState({
        error: 'Please select text in the document first',
        errorSeverity: 'warning'
      });
      return;
    }

    this.setState({
      isProcessing: true,
      processingMessage: 'Replacing text in document...',
      error: null
    });

    try {
      // Perform text replacement with formatting preservation
      const result = await replaceSelectedText(this.state.aiResponse, {
        preserveFormatting: true,
        validateSelection: true,
        selectAfterReplace: false,
      });

      if (!result.success) {
        // Replacement failed - show error
        this.setState({
          isProcessing: false,
          processingMessage: '',
          error: result.error || 'Failed to replace text in document',
          errorSeverity: 'error'
        });
        return;
      }

      // Success! Clear states and show brief success message
      this.setState({
        isProcessing: false,
        processingMessage: '',
        aiResponse: null,
        selectedText: '', // Clear selection as it's been replaced
        error: null
      });

      // Show temporary success notification
      setTimeout(() => {
        this.setState({
          error: `Successfully replaced ${result.originalLength} characters with ${result.newLength} characters`,
          errorSeverity: 'info'
        });

        // Clear success message after 3 seconds
        setTimeout(() => {
          this.setState({ error: null });
        }, 3000);
      }, 100);
    } catch (error) {
      // Handle unexpected errors
      this.setState({
        isProcessing: false,
        processingMessage: '',
        error: error instanceof Error ? error.message : 'Failed to replace text',
        errorSeverity: 'error'
      });
    }
  };

  clearError = () => {
    this.setState({ error: null });
  };

  getLocationBadgeClass = (location: SelectionLocation): string => {
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

  render() {
    const {
      selectedText,
      selectionLocation,
      selectionParagraphCount,
      selectionError,
      inlineContext,
      isProcessing,
      processingMessage,
      error,
      errorSeverity,
      aiResponse,
      uploadedFiles,
      fileUploadError,
      settings
    } = this.state;

    return (
      <div className="app-container">
        <header className="app-header">
          <h1>Word AI Plugin</h1>
          <p>AI-powered context-based text completion</p>
        </header>

        <main className="app-main">
          <section className="selection-section">
            <h2>Selected Text</h2>

            <button onClick={this.getSelectedText} className="get-selection-btn">
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
                  <span className={this.getLocationBadgeClass(selectionLocation)}>
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
              onChange={this.handleInlineContextChange}
              placeholder="Enter context here... (e.g., documentation, instructions, or reference material)"
              maxLength={10000}
            />

            <div className="context-divider">
              <span>OR</span>
            </div>

            <FileUpload
              files={uploadedFiles}
              onFilesChange={this.handleFilesChange}
              onError={this.handleFileUploadError}
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
              onSettingsChange={this.handleSettingsChange}
              onReset={this.handleSettingsReset}
            />
          </section>

          <section className="actions-section">
            <h2>Actions</h2>

            {/* Global error display */}
            {error && (
              <ErrorDisplay
                error={error}
                severity={errorSeverity}
                onDismiss={this.clearError}
                onRetry={aiResponse ? undefined : this.handleAskAI}
              />
            )}

            {/* Loading indicator */}
            {isProcessing && (
              <LoadingIndicator message={processingMessage} />
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
                    onClick={this.handleReplaceText}
                    className="primary-button"
                    disabled={isProcessing}
                  >
                    Replace Selected Text
                  </button>
                  <button
                    onClick={() => this.setState({ aiResponse: null })}
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
                onClick={this.handleAskAI}
                disabled={!selectedText || isProcessing}
                className="primary-button"
              >
                Ask AI
              </button>
            )}
          </section>
        </main>
      </div>
    );
  }
}

export default App;
