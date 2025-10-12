import * as React from 'react';
import { useState, useRef } from 'react';
import styles from './FileUpload.module.css';
import { UploadedFile as BaseUploadedFile } from '../../types/file';
import {
  validateFiles,
  formatFileSize,
  getFileExtension,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  SUPPORTED_FILE_TYPES,
  calculateTotalSize
} from '../../utils/fileValidation';

// Extended version that includes the File object for component use
export interface UploadedFile extends BaseUploadedFile {
  file?: File; // Optional File object for accessing file data
}

export interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFileSize?: number; // in bytes, default 10MB
  maxTotalSize?: number; // in bytes, default 50MB
  acceptedTypes?: string[]; // default: ['pdf', 'docx', 'txt', 'md', 'csv']
  onError?: (error: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  maxFileSize = MAX_FILE_SIZE,
  maxTotalSize = MAX_TOTAL_SIZE,
  acceptedTypes = SUPPORTED_FILE_TYPES,
  onError
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Process files and add to list using Stream B validation utilities
  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    // Convert FileList to array
    const fileArray = Array.from(fileList);

    // Check for duplicates
    const duplicates: string[] = [];
    const nonDuplicateFiles = fileArray.filter(file => {
      const isDuplicate = files.some(f => f.name === file.name && f.size === file.size);
      if (isDuplicate) {
        duplicates.push(`${file.name}: File already uploaded`);
      }
      return !isDuplicate;
    });

    // Use validation utilities from Stream B
    const validationResult = validateFiles(nonDuplicateFiles, {
      maxFileSize,
      maxTotalSize,
      allowedTypes: acceptedTypes as any,
      existingFiles: files
    });

    // Collect all errors
    const allErrors: string[] = [...duplicates, ...validationResult.errors];

    // Report errors if any
    if (allErrors.length > 0 && onError) {
      onError(allErrors.join('\n'));
    }

    // Create UploadedFile objects from valid files
    if (validationResult.validFiles.length > 0) {
      const newUploadedFiles: UploadedFile[] = validationResult.validFiles.map(file => {
        const extension = getFileExtension(file.name);
        return {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          extension,
          uploadedAt: Date.now()
        };
      });

      onFilesChange([...files, ...newUploadedFiles]);
    }
  };

  // Handle file input change
  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(event.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle click on upload area
  const handleUploadAreaClick = () => {
    fileInputRef.current?.click();
  };

  // Drag and drop handlers
  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current++;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = event.dataTransfer.files;
    processFiles(droppedFiles);
  };

  // Remove file from list
  const handleRemoveFile = (fileId: string) => {
    const updatedFiles = files.filter(f => f.id !== fileId);
    onFilesChange(updatedFiles);
  };

  // Get icon for file type
  const getFileIcon = (extension: string): string => {
    const iconMap: { [key: string]: string } = {
      pdf: '📄',
      docx: '📝',
      txt: '📃',
      md: '📋',
      csv: '📊'
    };
    // Remove leading dot if present
    const ext = extension.startsWith('.') ? extension.substring(1) : extension;
    return iconMap[ext] || '📎';
  };

  const totalSize = calculateTotalSize(files);
  const remainingSize = maxTotalSize - totalSize;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label}>
          Upload Context Files
        </label>
        <span className={styles.sizeInfo}>
          {formatFileSize(totalSize)} / {formatFileSize(maxTotalSize)}
        </span>
      </div>

      <div
        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaDragging : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleUploadAreaClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.map(type => `.${type}`).join(',')}
          onChange={handleFileInputChange}
          className={styles.fileInput}
        />
        <div className={styles.uploadContent}>
          <div className={styles.uploadIcon}>📁</div>
          <p className={styles.uploadText}>
            {isDragging ? 'Drop files here' : 'Click to upload or drag and drop files here'}
          </p>
          <p className={styles.uploadHint}>
            Supported: {acceptedTypes.map(t => t.toUpperCase()).join(', ')}
            (Max {formatFileSize(maxFileSize)} per file)
          </p>
        </div>
      </div>

      {files.length > 0 && (
        <div className={styles.fileList}>
          <div className={styles.fileListHeader}>
            <span className={styles.fileListTitle}>
              Uploaded Files ({files.length})
            </span>
          </div>
          {files.map((file) => (
            <div key={file.id} className={styles.fileItem}>
              <div className={styles.fileInfo}>
                <span className={styles.fileIcon}>{getFileIcon(file.extension)}</span>
                <div className={styles.fileDetails}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileMeta}>
                    {formatFileSize(file.size)} • {file.extension.toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => handleRemoveFile(file.id)}
                title="Remove file"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {remainingSize < maxFileSize && files.length > 0 && (
        <div className={styles.warning}>
          Warning: Only {formatFileSize(remainingSize)} remaining of total allowed size
        </div>
      )}
    </div>
  );
};

export default FileUpload;
