import * as React from 'react';
import styles from './TablePreview.module.css';
import { TableStructure, CellInfo } from '../../types/table';

/**
 * Represents an update to be applied to a cell
 */
export interface CellUpdate {
  rowIndex: number;
  colIndex: number;
  newValue: string;
  isEnabled: boolean;
}

export interface TablePreviewProps {
  /**
   * The original table structure
   */
  tableStructure: TableStructure;

  /**
   * Array of cell updates to preview
   */
  cellUpdates: CellUpdate[];

  /**
   * Callback when a cell's enabled state is toggled
   */
  onCellToggle: (rowIndex: number, colIndex: number) => void;

  /**
   * Whether to show statistics
   * @default true
   */
  showStatistics?: boolean;

  /**
   * Maximum visible rows before pagination
   * @default 10
   */
  maxVisibleRows?: number;
}

/**
 * TablePreview Component
 *
 * Displays a before/after preview of table changes with the following features:
 * - Visual highlighting of cells that will be filled (empty cells)
 * - Preview of AI-generated content before applying
 * - Support for large tables with pagination
 * - Interactive cell toggling (enable/disable individual cells)
 * - Statistics display (cells to fill, cells skipped)
 * - Full accessibility support
 */
const TablePreview: React.FC<TablePreviewProps> = ({
  tableStructure,
  cellUpdates,
  onCellToggle,
  showStatistics = true,
  maxVisibleRows = 10
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<'side-by-side' | 'overlay'>('side-by-side');

  // Calculate statistics
  const statistics = React.useMemo(() => {
    const enabledUpdates = cellUpdates.filter(u => u.isEnabled);
    const totalCells = tableStructure.info.totalCells;
    const cellsToFill = enabledUpdates.length;
    const cellsSkipped = cellUpdates.length - enabledUpdates.length;
    const emptyCells = tableStructure.cellsFlat.filter(c => c.isEmpty).length;

    return {
      totalCells,
      cellsToFill,
      cellsSkipped,
      emptyCells,
      percentageToFill: totalCells > 0 ? Math.round((cellsToFill / emptyCells) * 100) : 0
    };
  }, [cellUpdates, tableStructure]);

  // Create a map of updates for quick lookup
  const updateMap = React.useMemo(() => {
    const map = new Map<string, CellUpdate>();
    cellUpdates.forEach(update => {
      const key = `${update.rowIndex}-${update.colIndex}`;
      map.set(key, update);
    });
    return map;
  }, [cellUpdates]);

  // Pagination
  const totalPages = Math.ceil(tableStructure.info.rowCount / maxVisibleRows);
  const startRow = currentPage * maxVisibleRows;
  const endRow = Math.min(startRow + maxVisibleRows, tableStructure.info.rowCount);
  const visibleRows = tableStructure.cells.slice(startRow, endRow);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  const getCellClassName = (cell: CellInfo): string => {
    const key = `${cell.rowIndex}-${cell.colIndex}`;
    const update = updateMap.get(key);

    const classes = [styles.cell];

    if (update && update.isEnabled) {
      classes.push(styles.cellToFill);
    } else if (update && !update.isEnabled) {
      classes.push(styles.cellSkipped);
    } else if (cell.isEmpty) {
      classes.push(styles.cellEmpty);
    } else {
      classes.push(styles.cellExisting);
    }

    if (cell.isMerged) {
      classes.push(styles.cellMerged);
    }

    return classes.join(' ');
  };

  const getCellContent = (cell: CellInfo, showUpdate: boolean): string => {
    if (!showUpdate) {
      return cell.text || '(empty)';
    }

    const key = `${cell.rowIndex}-${cell.colIndex}`;
    const update = updateMap.get(key);

    if (update && update.isEnabled) {
      return update.newValue;
    }

    return cell.text || '(empty)';
  };

  const handleCellClick = (cell: CellInfo) => {
    const key = `${cell.rowIndex}-${cell.colIndex}`;
    const update = updateMap.get(key);

    // Only allow toggling if there's an update for this cell
    if (update) {
      onCellToggle(cell.rowIndex, cell.colIndex);
    }
  };

  const renderTable = (showUpdates: boolean, title: string) => (
    <div className={styles.tableContainer}>
      <h4 className={styles.tableTitle}>{title}</h4>
      <div className={styles.tableScroll}>
        <table className={styles.table} role="grid" aria-label={title}>
          <tbody>
            {visibleRows.map((row, rowIdx) => (
              <tr key={startRow + rowIdx}>
                {row.map((cell) => {
                  const key = `${cell.rowIndex}-${cell.colIndex}`;
                  const update = updateMap.get(key);
                  const isToggleable = !!update;

                  return (
                    <td
                      key={key}
                      className={getCellClassName(cell)}
                      onClick={() => isToggleable && handleCellClick(cell)}
                      role="gridcell"
                      aria-label={`Row ${cell.rowIndex + 1}, Column ${cell.colIndex + 1}${
                        update ? ` - Will be ${update.isEnabled ? 'filled' : 'skipped'}` : ''
                      }`}
                      tabIndex={isToggleable ? 0 : -1}
                      onKeyDown={(e) => {
                        if (isToggleable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          handleCellClick(cell);
                        }
                      }}
                      title={isToggleable ? 'Click to toggle' : undefined}
                    >
                      <div className={styles.cellContent}>
                        {getCellContent(cell, showUpdates)}
                        {isToggleable && (
                          <span className={styles.cellToggleIndicator} aria-hidden="true">
                            {update.isEnabled ? '✓' : '✗'}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className={styles.container} role="region" aria-label="Table Preview">
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>Table Preview</h3>
        <div className={styles.viewModeToggle}>
          <button
            className={viewMode === 'side-by-side' ? styles.viewModeActive : styles.viewModeButton}
            onClick={() => setViewMode('side-by-side')}
            aria-pressed={viewMode === 'side-by-side'}
            title="Side by side view"
          >
            Side-by-Side
          </button>
          <button
            className={viewMode === 'overlay' ? styles.viewModeActive : styles.viewModeButton}
            onClick={() => setViewMode('overlay')}
            aria-pressed={viewMode === 'overlay'}
            title="Overlay view"
          >
            Overlay
          </button>
        </div>
      </div>

      {/* Statistics */}
      {showStatistics && (
        <div className={styles.statistics} role="status" aria-live="polite">
          <div className={styles.stat}>
            <span className={styles.statLabel}>Total Cells:</span>
            <span className={styles.statValue}>{statistics.totalCells}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Empty Cells:</span>
            <span className={styles.statValue}>{statistics.emptyCells}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Will Fill:</span>
            <span className={`${styles.statValue} ${styles.statHighlight}`}>
              {statistics.cellsToFill}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Will Skip:</span>
            <span className={styles.statValue}>{statistics.cellsSkipped}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend} role="note" aria-label="Color legend">
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.legendColorFill}`} />
          <span>Will be filled</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.legendColorSkipped}`} />
          <span>Will be skipped</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.legendColorExisting}`} />
          <span>Existing content</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.legendColorEmpty}`} />
          <span>Empty (no updates)</span>
        </div>
      </div>

      {/* Tables */}
      <div className={viewMode === 'side-by-side' ? styles.sideBySide : styles.overlay}>
        {viewMode === 'side-by-side' ? (
          <>
            {renderTable(false, 'Before')}
            {renderTable(true, 'After')}
          </>
        ) : (
          renderTable(true, 'Preview with Changes')
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination} role="navigation" aria-label="Table pagination">
          <button
            className={styles.paginationButton}
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className={styles.paginationInfo}>
            Page {currentPage + 1} of {totalPages}
            <span className={styles.paginationDetail}>
              (Rows {startRow + 1}-{endRow} of {tableStructure.info.rowCount})
            </span>
          </span>
          <button
            className={styles.paginationButton}
            onClick={handleNextPage}
            disabled={currentPage === totalPages - 1}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      )}

      {/* Help Text */}
      <div className={styles.helpText}>
        <p>Click on highlighted cells to toggle whether they will be filled.</p>
        <p>Cells marked with ✓ will be filled, cells with ✗ will be skipped.</p>
      </div>
    </div>
  );
};

export default TablePreview;
