import * as React from 'react';
import { useState, useRef } from 'react';
import styles from './FileUpload.module.css';

// Placeholder types - Stream B will provide proper validation types
export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
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
  maxFileSize = 10 * 1024 * 1024, // 10MB
  maxTotalSize = 50 * 1024 * 1024, // 50MB
  acceptedTypes = ['pdf', 'docx', 'txt', 'md', 'csv'],
  onError
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Calculate total size of uploaded files
  const getTotalSize = (fileList: UploadedFile[]): number => {
    return fileList.reduce((total, file) => total + file.size, 0);
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Get file extension
  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  // Process files and add to list (validation will be handled by Stream B utilities)
  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const newFiles: UploadedFile[] = [];
    const errors: string[] = [];

    // Convert FileList to array
    const fileArray = Array.from(fileList);

    for (const file of fileArray) {
      const extension = getFileExtension(file.name);

      // Basic client-side validation (Stream B will provide more robust validation)
      if (!acceptedTypes.includes(extension)) {
        errors.push(`${file.name}: File type .${extension} is not supported. Accepted types: ${acceptedTypes.join(', ')}`);
        continue;
      }

      if (file.size > maxFileSize) {
        errors.push(`${file.name}: File size (${formatFileSize(file.size)}) exceeds maximum (${formatFileSize(maxFileSize)})`);
        continue;
      }

      // Check if file already exists
      const isDuplicate = files.some(f => f.name === file.name && f.size === file.size);
      if (isDuplicate) {
        errors.push(`${file.name}: File already uploaded`);
        continue;
      }

      // Create uploaded file object
      const uploadedFile: UploadedFile = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        size: file.size,
        type: extension,
        uploadedAt: Date.now()
      };

      newFiles.push(uploadedFile);
    }

    // Check total size
    const currentTotalSize = getTotalSize(files);
    const newTotalSize = getTotalSize(newFiles);
    const combinedTotalSize = currentTotalSize + newTotalSize;

    if (combinedTotalSize > maxTotalSize) {
      errors.push(`Total size (${formatFileSize(combinedTotalSize)}) would exceed maximum (${formatFileSize(maxTotalSize)})`);
      if (onError) {
        onError(errors.join('\n'));
      }
      return;
    }

    // Report errors if any
    if (errors.length > 0 && onError) {
      onError(errors.join('\n'));
    }

    // Add valid files to the list
    if (newFiles.length > 0) {
      onFilesChange([...files, ...newFiles]);
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
  const getFileIcon = (fileType: string): string => {
    const iconMap: { [key: string]: string } = {
      pdf: '📄',
      docx: '📝',
      txt: '📃',
      md: '📋',
      csv: '📊'
    };
    return iconMap[fileType] || '📎';
  };

  const totalSize = getTotalSize(files);
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
                <span className={styles.fileIcon}>{getFileIcon(file.type)}</span>
                <div className={styles.fileDetails}>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.fileMeta}>
                    {formatFileSize(file.size)} • {file.type.toUpperCase()}
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
