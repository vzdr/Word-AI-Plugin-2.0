import * as React from 'react';
import styles from './Settings.module.css';

// TypeScript interfaces for Stream B to implement
export interface SettingsValues {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface SettingsProps {
  settings: SettingsValues;
  onSettingsChange: (settings: SettingsValues) => void;
  onReset: () => void;
}

// Model options for dropdown
const MODEL_OPTIONS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-flash-latest', label: 'Gemini Flash Latest' },
  { value: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite Latest' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' }
];

// Validation constants
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 1;
const TEMPERATURE_STEP = 0.1;
const MAX_TOKENS_MIN = 100;
const MAX_TOKENS_MAX = 4000;

const Settings: React.FC<SettingsProps> = ({ settings, onSettingsChange, onReset }) => {
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [maxTokensInput, setMaxTokensInput] = React.useState(settings.maxTokens.toString());

  // Update local maxTokens input when settings change externally
  React.useEffect(() => {
    setMaxTokensInput(settings.maxTokens.toString());
  }, [settings.maxTokens]);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({
      ...settings,
      model: e.target.value
    });
  };

  const handleTemperatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onSettingsChange({
      ...settings,
      temperature: value
    });
  };

  const handleMaxTokensChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setMaxTokensInput(value);

    // Only update settings if value is valid
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= MAX_TOKENS_MIN && numValue <= MAX_TOKENS_MAX) {
      onSettingsChange({
        ...settings,
        maxTokens: numValue
      });
    }
  };

  const handleMaxTokensBlur = () => {
    // Validate and correct on blur
    const numValue = parseInt(maxTokensInput, 10);
    if (isNaN(numValue) || numValue < MAX_TOKENS_MIN) {
      setMaxTokensInput(MAX_TOKENS_MIN.toString());
      onSettingsChange({
        ...settings,
        maxTokens: MAX_TOKENS_MIN
      });
    } else if (numValue > MAX_TOKENS_MAX) {
      setMaxTokensInput(MAX_TOKENS_MAX.toString());
      onSettingsChange({
        ...settings,
        maxTokens: MAX_TOKENS_MAX
      });
    }
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const handleResetConfirm = () => {
    onReset();
    setShowResetConfirm(false);
  };

  const handleResetCancel = () => {
    setShowResetConfirm(false);
  };

  // Calculate temperature percentage for visual feedback
  const temperaturePercentage = (settings.temperature / TEMPERATURE_MAX) * 100;

  return (
    <div className={styles.container}>
      <div className={styles.settingsGroup}>
        <label className={styles.label} htmlFor="model-select">
          AI Model
        </label>
        <select
          id="model-select"
          value={settings.model}
          onChange={handleModelChange}
          className={styles.select}
        >
          {MODEL_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className={styles.helpText}>
          Select the AI model to use for text generation
        </p>
      </div>

      <div className={styles.settingsGroup}>
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="temperature-slider">
            Temperature
          </label>
          <span className={styles.value}>{settings.temperature.toFixed(1)}</span>
        </div>
        <div className={styles.sliderContainer}>
          <input
            id="temperature-slider"
            type="range"
            min={TEMPERATURE_MIN}
            max={TEMPERATURE_MAX}
            step={TEMPERATURE_STEP}
            value={settings.temperature}
            onChange={handleTemperatureChange}
            className={styles.slider}
            style={{
              background: `linear-gradient(to right, #667eea 0%, #667eea ${temperaturePercentage}%, #e0e0e0 ${temperaturePercentage}%, #e0e0e0 100%)`
            }}
          />
          <div className={styles.sliderLabels}>
            <span className={styles.sliderLabel}>Precise</span>
            <span className={styles.sliderLabel}>Creative</span>
          </div>
        </div>
        <p className={styles.helpText}>
          Lower values make output more focused, higher values more creative
        </p>
      </div>

      <div className={styles.settingsGroup}>
        <label className={styles.label} htmlFor="max-tokens-input">
          Max Tokens
        </label>
        <input
          id="max-tokens-input"
          type="number"
          min={MAX_TOKENS_MIN}
          max={MAX_TOKENS_MAX}
          value={maxTokensInput}
          onChange={handleMaxTokensChange}
          onBlur={handleMaxTokensBlur}
          className={styles.input}
        />
        <p className={styles.helpText}>
          Maximum length of generated text ({MAX_TOKENS_MIN}-{MAX_TOKENS_MAX} tokens)
        </p>
      </div>

      <div className={styles.resetSection}>
        <button
          onClick={handleResetClick}
          className={styles.resetButton}
          type="button"
        >
          Reset to Defaults
        </button>
      </div>

      {showResetConfirm && (
        <div className={styles.confirmDialog}>
          <div className={styles.confirmContent}>
            <h3 className={styles.confirmTitle}>Reset Settings?</h3>
            <p className={styles.confirmMessage}>
              This will reset all settings to their default values. Are you sure?
            </p>
            <div className={styles.confirmButtons}>
              <button
                onClick={handleResetCancel}
                className={styles.cancelButton}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleResetConfirm}
                className={styles.confirmButton}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
