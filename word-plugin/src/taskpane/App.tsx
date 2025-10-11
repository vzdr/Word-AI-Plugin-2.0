import * as React from 'react';
import './App.css';

interface AppState {
  selectedText: string;
  isProcessing: boolean;
}

class App extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      selectedText: '',
      isProcessing: false
    };
  }

  getSelectedText = async () => {
    try {
      await Word.run(async (context) => {
        const range = context.document.getSelection();
        range.load('text');
        await context.sync();

        this.setState({ selectedText: range.text });
      });
    } catch (error) {
      console.error('Error getting selection:', error);
    }
  };

  render() {
    return (
      <div className="app-container">
        <header className="app-header">
          <h1>Word AI Plugin</h1>
          <p>AI-powered context-based text completion</p>
        </header>

        <main className="app-main">
          <section className="selection-section">
            <h2>Selected Text</h2>
            <button onClick={this.getSelectedText}>
              Get Selection
            </button>
            {this.state.selectedText && (
              <div className="selected-text">
                <pre>{this.state.selectedText}</pre>
              </div>
            )}
          </section>

          <section className="context-section">
            <h2>Context</h2>
            <p>Upload context files or provide inline context (Coming soon)</p>
          </section>

          <section className="actions-section">
            <h2>Actions</h2>
            <button
              disabled={!this.state.selectedText || this.state.isProcessing}
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
