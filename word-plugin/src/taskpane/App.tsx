import * as React from 'react';
import './App.css';
import InlineContext from './components/InlineContext';
import FileUpload, { UploadedFile } from './components/FileUpload';
import Settings, { SettingsValues } from './components/Settings';
import {
  getTextSelection,
  SelectionLocation
} from '../utils/textSelection';

interface AppState {
  selectedText: string;
  selectionLocation: SelectionLocation;
  selectionParagraphCount: number;
  selectionError: string | null;
  isProcessing: boolean;
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
            <button
              disabled={!selectedText || isProcessing}
              className="primary-button"
            >
              Ask AI
            </button>
          </section>
        </main>
      </div>
    );
  }
}

export default App;
