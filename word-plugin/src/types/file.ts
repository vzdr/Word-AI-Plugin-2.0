/**
 * File-related type definitions for Word AI Plugin
 * Defines interfaces for file upload, validation, and management
 */

/**
 * Supported file types for upload
 */
export type SupportedFileType = 'pdf' | 'docx' | 'txt' | 'md' | 'csv';

/**
 * File MIME type mapping
 */
export interface FileMimeTypes {
  pdf: string[];
  docx: string[];
  txt: string[];
  md: string[];
  csv: string[];
}

/**
 * Uploaded file data structure
 */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  content?: string;
  uploadedAt: number;
}

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: FileValidationErrorCode;
}

/**
 * File validation error codes
 */
export enum FileValidationErrorCode {
  INVALID_TYPE = 'INVALID_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  TOTAL_SIZE_EXCEEDED = 'TOTAL_SIZE_EXCEEDED',
  INVALID_EXTENSION = 'INVALID_EXTENSION',
  INVALID_MIME_TYPE = 'INVALID_MIME_TYPE',
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  NO_FILE = 'NO_FILE',
}

/**
 * File upload constraints
 */
export interface FileUploadConstraints {
  maxFileSize: number;
  maxTotalSize: number;
  allowedTypes: SupportedFileType[];
  allowedExtensions: string[];
  allowedMimeTypes: FileMimeTypes;
}

/**
 * File validation options
 */
export interface FileValidationOptions {
  maxFileSize?: number;
  maxTotalSize?: number;
  allowedTypes?: SupportedFileType[];
  existingFiles?: UploadedFile[];
}

/**
 * Batch file validation result
 */
export interface BatchValidationResult {
  valid: boolean;
  validFiles: File[];
  invalidFiles: Array<{
    file: File;
    error: string;
    errorCode: FileValidationErrorCode;
  }>;
  totalSize: number;
  errors: string[];
}
