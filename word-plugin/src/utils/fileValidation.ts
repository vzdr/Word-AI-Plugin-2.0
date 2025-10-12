/**
 * File validation utilities for Word AI Plugin
 * Provides validation functions for file type, size, and content
 */

import {
  SupportedFileType,
  FileMimeTypes,
  FileValidationResult,
  FileValidationErrorCode,
  FileUploadConstraints,
  FileValidationOptions,
  BatchValidationResult,
  UploadedFile,
} from '../types/file';

/**
 * Maximum file size: 10MB per file
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

/**
 * Maximum total upload size: 50MB
 */
export const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB in bytes

/**
 * Supported file types
 */
export const SUPPORTED_FILE_TYPES: SupportedFileType[] = [
  'pdf',
  'docx',
  'txt',
  'md',
  'csv',
];

/**
 * Allowed file extensions
 */
export const ALLOWED_EXTENSIONS: string[] = [
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.csv',
];

/**
 * MIME type mappings for supported file types
 */
export const MIME_TYPE_MAP: FileMimeTypes = {
  pdf: ['application/pdf'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  csv: ['text/csv', 'application/vnd.ms-excel'],
};

/**
 * Default file upload constraints
 */
export const DEFAULT_CONSTRAINTS: FileUploadConstraints = {
  maxFileSize: MAX_FILE_SIZE,
  maxTotalSize: MAX_TOTAL_SIZE,
  allowedTypes: SUPPORTED_FILE_TYPES,
  allowedExtensions: ALLOWED_EXTENSIONS,
  allowedMimeTypes: MIME_TYPE_MAP,
};

/**
 * Extract file extension from filename
 * @param filename - The filename to extract extension from
 * @returns The file extension (including dot) in lowercase
 */
export function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return '';
  }
  return filename.substring(lastDotIndex).toLowerCase();
}

/**
 * Get file type from extension
 * @param extension - The file extension (with or without dot)
 * @returns The supported file type or null if not supported
 */
export function getFileTypeFromExtension(
  extension: string
): SupportedFileType | null {
  const normalizedExt = extension.startsWith('.')
    ? extension.substring(1).toLowerCase()
    : extension.toLowerCase();

  if (SUPPORTED_FILE_TYPES.includes(normalizedExt as SupportedFileType)) {
    return normalizedExt as SupportedFileType;
  }

  return null;
}

/**
 * Validate file extension
 * @param filename - The filename to validate
 * @returns Validation result
 */
export function validateFileExtension(filename: string): FileValidationResult {
  const extension = getFileExtension(filename);

  if (!extension) {
    return {
      valid: false,
      error: 'File has no extension',
      errorCode: FileValidationErrorCode.INVALID_EXTENSION,
    };
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `File type not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      errorCode: FileValidationErrorCode.INVALID_EXTENSION,
    };
  }

  return { valid: true };
}

/**
 * Validate file MIME type
 * @param file - The file to validate
 * @returns Validation result
 */
export function validateFileMimeType(file: File): FileValidationResult {
  const extension = getFileExtension(file.name);
  const fileType = getFileTypeFromExtension(extension);

  if (!fileType) {
    return {
      valid: false,
      error: 'Unknown file type',
      errorCode: FileValidationErrorCode.INVALID_MIME_TYPE,
    };
  }

  const allowedMimeTypes = MIME_TYPE_MAP[fileType];

  // If file.type is empty (common in some browsers), rely on extension validation
  if (!file.type) {
    return { valid: true };
  }

  if (!allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid MIME type for ${fileType.toUpperCase()} file. Expected: ${allowedMimeTypes.join(' or ')}`,
      errorCode: FileValidationErrorCode.INVALID_MIME_TYPE,
    };
  }

  return { valid: true };
}

/**
 * Validate file type (extension and MIME type)
 * @param file - The file to validate
 * @returns Validation result
 */
export function validateFileType(file: File): FileValidationResult {
  // First validate extension
  const extensionResult = validateFileExtension(file.name);
  if (!extensionResult.valid) {
    return extensionResult;
  }

  // Then validate MIME type
  const mimeTypeResult = validateFileMimeType(file);
  if (!mimeTypeResult.valid) {
    return mimeTypeResult;
  }

  return { valid: true };
}

/**
 * Validate file size
 * @param file - The file to validate
 * @param maxSize - Maximum allowed size in bytes (default: MAX_FILE_SIZE)
 * @returns Validation result
 */
export function validateFileSize(
  file: File,
  maxSize: number = MAX_FILE_SIZE
): FileValidationResult {
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File "${file.name}" is too large (${fileSizeMB}MB). Maximum size: ${maxSizeMB}MB`,
      errorCode: FileValidationErrorCode.FILE_TOO_LARGE,
    };
  }

  return { valid: true };
}

/**
 * Calculate total size of files
 * @param files - Array of files or UploadedFile objects
 * @returns Total size in bytes
 */
export function calculateTotalSize(
  files: (File | UploadedFile)[]
): number {
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Format file size for display
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Validate total upload size
 * @param newFiles - New files to upload
 * @param existingFiles - Already uploaded files
 * @param maxTotalSize - Maximum total size in bytes (default: MAX_TOTAL_SIZE)
 * @returns Validation result
 */
export function validateTotalSize(
  newFiles: File[],
  existingFiles: UploadedFile[] = [],
  maxTotalSize: number = MAX_TOTAL_SIZE
): FileValidationResult {
  const existingSize = calculateTotalSize(existingFiles);
  const newSize = calculateTotalSize(newFiles);
  const totalSize = existingSize + newSize;

  if (totalSize > maxTotalSize) {
    const maxSizeMB = (maxTotalSize / (1024 * 1024)).toFixed(1);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Total upload size (${totalSizeMB}MB) exceeds maximum limit (${maxSizeMB}MB)`,
      errorCode: FileValidationErrorCode.TOTAL_SIZE_EXCEEDED,
    };
  }

  return { valid: true };
}

/**
 * Validate a single file
 * @param file - The file to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): FileValidationResult {
  if (!file) {
    return {
      valid: false,
      error: 'No file provided',
      errorCode: FileValidationErrorCode.NO_FILE,
    };
  }

  // Validate file type
  const typeResult = validateFileType(file);
  if (!typeResult.valid) {
    return typeResult;
  }

  // Validate file size
  const maxFileSize = options.maxFileSize ?? MAX_FILE_SIZE;
  const sizeResult = validateFileSize(file, maxFileSize);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  return { valid: true };
}

/**
 * Validate multiple files
 * @param files - Array of files to validate
 * @param options - Validation options
 * @returns Batch validation result
 */
export function validateFiles(
  files: File[],
  options: FileValidationOptions = {}
): BatchValidationResult {
  const validFiles: File[] = [];
  const invalidFiles: Array<{
    file: File;
    error: string;
    errorCode: FileValidationErrorCode;
  }> = [];
  const errors: string[] = [];

  // Validate each file individually
  for (const file of files) {
    const result = validateFile(file, options);
    if (result.valid) {
      validFiles.push(file);
    } else {
      invalidFiles.push({
        file,
        error: result.error || 'Unknown error',
        errorCode: result.errorCode || FileValidationErrorCode.INVALID_TYPE,
      });
      errors.push(result.error || 'Unknown error');
    }
  }

  // Validate total size
  const existingFiles = options.existingFiles || [];
  const maxTotalSize = options.maxTotalSize ?? MAX_TOTAL_SIZE;
  const totalSizeResult = validateTotalSize(
    validFiles,
    existingFiles,
    maxTotalSize
  );

  if (!totalSizeResult.valid) {
    errors.push(totalSizeResult.error || 'Total size exceeded');
    return {
      valid: false,
      validFiles: [],
      invalidFiles: validFiles.map((file) => ({
        file,
        error: totalSizeResult.error || 'Total size exceeded',
        errorCode:
          totalSizeResult.errorCode ||
          FileValidationErrorCode.TOTAL_SIZE_EXCEEDED,
      })),
      totalSize: calculateTotalSize(validFiles) + calculateTotalSize(existingFiles),
      errors,
    };
  }

  const totalSize = calculateTotalSize(validFiles) + calculateTotalSize(existingFiles);

  return {
    valid: invalidFiles.length === 0,
    validFiles,
    invalidFiles,
    totalSize,
    errors,
  };
}

/**
 * Generate error message for validation failure
 * @param errorCode - The error code
 * @param details - Additional details (e.g., filename, size)
 * @returns User-friendly error message
 */
export function getValidationErrorMessage(
  errorCode: FileValidationErrorCode,
  details?: { filename?: string; size?: number; maxSize?: number }
): string {
  switch (errorCode) {
    case FileValidationErrorCode.INVALID_TYPE:
      return `File type not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`;

    case FileValidationErrorCode.FILE_TOO_LARGE:
      const maxSizeMB = details?.maxSize
        ? (details.maxSize / (1024 * 1024)).toFixed(1)
        : '10';
      const fileSizeMB = details?.size
        ? (details.size / (1024 * 1024)).toFixed(1)
        : 'unknown';
      return `File is too large (${fileSizeMB}MB). Maximum size: ${maxSizeMB}MB`;

    case FileValidationErrorCode.TOTAL_SIZE_EXCEEDED:
      return 'Total upload size exceeds 50MB limit';

    case FileValidationErrorCode.INVALID_EXTENSION:
      return `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;

    case FileValidationErrorCode.INVALID_MIME_TYPE:
      return 'File type validation failed. Please ensure the file is not corrupted';

    case FileValidationErrorCode.FILE_READ_ERROR:
      return `Failed to read file${details?.filename ? ` "${details.filename}"` : ''}`;

    case FileValidationErrorCode.NO_FILE:
      return 'No file provided';

    default:
      return 'File validation failed';
  }
}

/**
 * Check if a file type is supported
 * @param extension - File extension (with or without dot)
 * @returns True if supported, false otherwise
 */
export function isSupportedFileType(extension: string): boolean {
  const fileType = getFileTypeFromExtension(extension);
  return fileType !== null;
}

/**
 * Get all supported MIME types as a flat array
 * @returns Array of all supported MIME types
 */
export function getAllSupportedMimeTypes(): string[] {
  return Object.values(MIME_TYPE_MAP).flat();
}

/**
 * Get user-friendly file type description
 * @param fileType - The file type
 * @returns Human-readable description
 */
export function getFileTypeDescription(fileType: SupportedFileType): string {
  const descriptions: Record<SupportedFileType, string> = {
    pdf: 'PDF Document',
    docx: 'Word Document',
    txt: 'Text File',
    md: 'Markdown File',
    csv: 'CSV Spreadsheet',
  };

  return descriptions[fileType] || fileType.toUpperCase();
}
