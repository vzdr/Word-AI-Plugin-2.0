import * as React from 'react';
import { useState, useEffect } from 'react';
import styles from './InlineContext.module.css';
import { useSessionStorage } from '../../hooks/useSessionStorage';
import { logger, logUserAction } from '../../utils/logger';

export interface InlineContextProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}

const InlineContext: React.FC<InlineContextProps> = ({
  value,
  onChange,
  maxLength = 10000,
  placeholder = 'Enter context here...'
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Auto-save to session storage
  const {
    setValue: saveToStorage,
    isLoading,
    isSaving,
    lastSaved
  } = useSessionStorage<string>('inline-context', {
    defaultValue: '',
    autoSaveDelay: 500
  });

  // Sync prop value changes to storage
  useEffect(() => {
    saveToStorage(value);
    if (value.length > 0) {
      logger.debug('Inline context saved to session storage', {
        length: value.length
      });
    }
  }, [value, saveToStorage]);

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;

    if (newValue.length <= maxLength) {
      logger.debug('Inline context changed', {
        length: newValue.length,
        maxLength
      });
      onChange(newValue);
    } else {
      logger.warn('Inline context exceeds max length', {
        attemptedLength: newValue.length,
        maxLength
      });
    }
  };

  const handleClearClick = () => {
    if (value.trim().length > 0) {
      logUserAction('Inline context clear requested', {
        currentLength: value.length
      });
      setShowClearConfirm(true);
    }
  };

  const handleConfirmClear = () => {
    logUserAction('Inline context cleared', {
      previousLength: value.length
    });
    onChange('');
    setShowClearConfirm(false);
  };

  const handleCancelClear = () => {
    logger.debug('Inline context clear cancelled');
    setShowClearConfirm(false);
  };

  const characterCount = value.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label}>
          Inline Context
          {isSaving && <span className={styles.savingIndicator}> (saving...)</span>}
          {lastSaved && !isSaving && (
            <span className={styles.savedIndicator}> ✓ saved</span>
          )}
        </label>
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClearClick}
          disabled={value.length === 0 || isLoading}
          title="Clear context"
        >
          Clear
        </button>
      </div>

      <textarea
        className={styles.textarea}
        value={value}
        onChange={handleTextChange}
        placeholder={placeholder}
        rows={8}
        maxLength={maxLength}
        disabled={isLoading}
      />

      <div className={styles.footer}>
        <span className={`${styles.counter} ${isNearLimit ? styles.counterWarning : ''}`}>
          {characterCount} / {maxLength}
        </span>
      </div>

      {showClearConfirm && (
        <div className={styles.confirmDialog}>
          <div className={styles.confirmContent}>
            <p className={styles.confirmMessage}>
              Are you sure you want to clear the context?
            </p>
            <div className={styles.confirmButtons}>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={handleConfirmClear}
              >
                Yes, Clear
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancelClear}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InlineContext;
