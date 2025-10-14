import * as React from 'react';
import styles from './CellFillOptions.module.css';
import { AutoFillOptions, FillStrategy } from '../../types/table';

export interface CellFillOptionsProps {
  /**
   * Current auto-fill options
   */
  options: AutoFillOptions;

  /**
   * Callback when options change
   */
  onChange: (options: AutoFillOptions) => void;

  /**
   * Callback when user confirms the operation
   */
  onConfirm: () => void;

  /**
   * Callback when user cancels the operation
   */
  onCancel: () => void;

  /**
   * Estimated number of tokens to be used
   */
  estimatedTokens?: number;

  /**
   * Estimated time in seconds
   */
  estimatedTime?: number;

  /**
   * Whether the confirm button is disabled
   * @default false
   */
  confirmDisabled?: boolean;

  /**
   * Loading state
   * @default false
   */
  isLoading?: boolean;
}

/**
 * CellFillOptions Component
 *
 * Provides configuration options for auto-filling table cells:
 * - Toggle between filling only empty cells or overriding existing content
 * - Select fill strategy (row-by-row, column-by-column, all-at-once, cell-by-cell)
 * - Option to skip merged cells
 * - Option to preserve cell formatting
 * - Display estimated AI token usage and time
 * - Confirm and Cancel actions
 */
const CellFillOptions: React.FC<CellFillOptionsProps> = ({
  options,
  onChange,
  onConfirm,
  onCancel,
  estimatedTokens,
  estimatedTime,
  confirmDisabled = false,
  isLoading = false
}) => {
  // Strategy labels and descriptions
  const strategyOptions: Array<{ value: FillStrategy; label: string; description: string }> = [
    {
      value: 'row-by-row',
      label: 'Row by Row',
      description: 'Fill cells one row at a time (recommended for better context)'
    },
    {
      value: 'column-by-column',
      label: 'Column by Column',
      description: 'Fill cells one column at a time'
    },
    {
      value: 'all-at-once',
      label: 'All at Once',
      description: 'Fill all cells in a single operation (faster but less contextual)'
    },
    {
      value: 'cell-by-cell',
      label: 'Cell by Cell',
      description: 'Fill each cell individually (slowest but most precise)'
    }
  ];

  const handleEmptyOnlyToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...options,
      emptyOnly: e.target.checked
    });
  };

  const handlePreserveFormattingToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...options,
      preserveFormatting: e.target.checked
    });
  };

  const handleSkipMergedToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...options,
      skipMergedCells: e.target.checked
    });
  };

  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...options,
      fillStrategy: e.target.value as FillStrategy
    });
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `~${seconds} seconds`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `~${minutes}m ${remainingSeconds}s`;
  };

  const formatTokens = (tokens: number): string => {
    if (tokens < 1000) {
      return `${tokens}`;
    }
    return `${(tokens / 1000).toFixed(1)}k`;
  };

  const selectedStrategy = strategyOptions.find(s => s.value === options.fillStrategy);

  return (
    <div className={styles.container} role="region" aria-label="Cell Fill Options">
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>Fill Options</h3>
      </div>

      {/* Main Options */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Content Options</h4>

        <div className={styles.option}>
          <label className={styles.checkboxLabel} htmlFor="empty-only-toggle">
            <input
              id="empty-only-toggle"
              type="checkbox"
              checked={options.emptyOnly ?? true}
              onChange={handleEmptyOnlyToggle}
              disabled={isLoading}
              className={styles.checkbox}
            />
            <span className={styles.labelText}>Fill only empty cells</span>
          </label>
          <p className={styles.helpText}>
            When enabled, only cells without content will be filled. Disable to override existing content.
          </p>
        </div>

        <div className={styles.option}>
          <label className={styles.checkboxLabel} htmlFor="preserve-formatting-toggle">
            <input
              id="preserve-formatting-toggle"
              type="checkbox"
              checked={options.preserveFormatting ?? true}
              onChange={handlePreserveFormattingToggle}
              disabled={isLoading}
              className={styles.checkbox}
            />
            <span className={styles.labelText}>Preserve cell formatting</span>
          </label>
          <p className={styles.helpText}>
            Keep existing font styles, colors, and other formatting when filling cells.
          </p>
        </div>

        <div className={styles.option}>
          <label className={styles.checkboxLabel} htmlFor="skip-merged-toggle">
            <input
              id="skip-merged-toggle"
              type="checkbox"
              checked={options.skipMergedCells ?? true}
              onChange={handleSkipMergedToggle}
              disabled={isLoading}
              className={styles.checkbox}
            />
            <span className={styles.labelText}>Skip merged cells</span>
          </label>
          <p className={styles.helpText}>
            Exclude merged cells from the fill operation to avoid conflicts.
          </p>
        </div>
      </div>

      {/* Fill Strategy */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Fill Strategy</h4>

        <div className={styles.option}>
          <label className={styles.label} htmlFor="fill-strategy-select">
            Strategy
          </label>
          <select
            id="fill-strategy-select"
            value={options.fillStrategy ?? 'row-by-row'}
            onChange={handleStrategyChange}
            disabled={isLoading}
            className={styles.select}
          >
            {strategyOptions.map(strategy => (
              <option key={strategy.value} value={strategy.value}>
                {strategy.label}
              </option>
            ))}
          </select>
          {selectedStrategy && (
            <p className={styles.helpText}>{selectedStrategy.description}</p>
          )}
        </div>
      </div>

      {/* Estimates */}
      {(estimatedTokens !== undefined || estimatedTime !== undefined) && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Estimates</h4>

          <div className={styles.estimates}>
            {estimatedTokens !== undefined && (
              <div className={styles.estimate}>
                <div className={styles.estimateIcon} aria-hidden="true">
                  🔢
                </div>
                <div className={styles.estimateContent}>
                  <span className={styles.estimateLabel}>Token Usage</span>
                  <span className={styles.estimateValue}>
                    {formatTokens(estimatedTokens)} tokens
                  </span>
                </div>
              </div>
            )}

            {estimatedTime !== undefined && (
              <div className={styles.estimate}>
                <div className={styles.estimateIcon} aria-hidden="true">
                  ⏱️
                </div>
                <div className={styles.estimateContent}>
                  <span className={styles.estimateLabel}>Processing Time</span>
                  <span className={styles.estimateValue}>{formatTime(estimatedTime)}</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.estimateNote}>
            <p className={styles.helpText}>
              Estimates are approximate and may vary based on API response times and content complexity.
            </p>
          </div>
        </div>
      )}

      {/* Warning for overriding content */}
      {!options.emptyOnly && (
        <div className={styles.warning} role="alert">
          <span className={styles.warningIcon} aria-hidden="true">
            ⚠️
          </span>
          <div className={styles.warningContent}>
            <strong>Warning:</strong> Existing cell content will be overridden. This action cannot be easily undone.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className={styles.cancelButton}
          aria-label="Cancel fill operation"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled || isLoading}
          className={styles.confirmButton}
          aria-label="Confirm and fill cells"
        >
          {isLoading ? 'Processing...' : 'Confirm and Fill'}
        </button>
      </div>
    </div>
  );
};

export default CellFillOptions;
