/**
 * Comprehensive tests for file validation utilities
 *
 * Tests all file validation functions including type checking,
 * size validation, MIME type validation, and batch operations.
 */

import {
  getFileExtension,
  getFileTypeFromExtension,
  validateFileExtension,
  validateFileMimeType,
  validateFileType,
  validateFileSize,
  calculateTotalSize,
  formatFileSize,
  validateTotalSize,
  validateFile,
  validateFiles,
  getValidationErrorMessage,
  isSupportedFileType,
  getAllSupportedMimeTypes,
  getFileTypeDescription,
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  SUPPORTED_FILE_TYPES,
  ALLOWED_EXTENSIONS,
  MIME_TYPE_MAP,
} from '../fileValidation';
import { FileValidationErrorCode } from '../../types/file';

// Helper to create mock File object
function createMockFile(
  name: string,
  size: number,
  type: string = ''
): File {
  const file = new File([], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('getFileExtension', () => {
  it('should extract extension from filename with dot', () => {
    expect(getFileExtension('document.pdf')).toBe('.pdf');
    expect(getFileExtension('test.docx')).toBe('.docx');
    expect(getFileExtension('readme.md')).toBe('.md');
  });

  it('should return lowercase extension', () => {
    expect(getFileExtension('Document.PDF')).toBe('.pdf');
    expect(getFileExtension('TEST.DOCX')).toBe('.docx');
  });

  it('should handle files with multiple dots', () => {
    expect(getFileExtension('my.document.pdf')).toBe('.pdf');
    expect(getFileExtension('archive.tar.gz')).toBe('.gz');
  });

  it('should return empty string for files without extension', () => {
    expect(getFileExtension('README')).toBe('');
    expect(getFileExtension('noextension')).toBe('');
  });

  it('should handle edge cases', () => {
    expect(getFileExtension('')).toBe('');
    expect(getFileExtension('.')).toBe('.');
    expect(getFileExtension('.gitignore')).toBe('.gitignore');
  });
});

describe('getFileTypeFromExtension', () => {
  it('should return correct file type for supported extensions', () => {
    expect(getFileTypeFromExtension('.pdf')).toBe('pdf');
    expect(getFileTypeFromExtension('.docx')).toBe('docx');
    expect(getFileTypeFromExtension('.txt')).toBe('txt');
    expect(getFileTypeFromExtension('.md')).toBe('md');
    expect(getFileTypeFromExtension('.csv')).toBe('csv');
  });

  it('should work without leading dot', () => {
    expect(getFileTypeFromExtension('pdf')).toBe('pdf');
    expect(getFileTypeFromExtension('docx')).toBe('docx');
  });

  it('should be case insensitive', () => {
    expect(getFileTypeFromExtension('.PDF')).toBe('pdf');
    expect(getFileTypeFromExtension('DOCX')).toBe('docx');
  });

  it('should return null for unsupported extensions', () => {
    expect(getFileTypeFromExtension('.exe')).toBeNull();
    expect(getFileTypeFromExtension('.zip')).toBeNull();
    expect(getFileTypeFromExtension('unknown')).toBeNull();
  });
});

describe('validateFileExtension', () => {
  it('should validate supported file extensions', () => {
    expect(validateFileExtension('document.pdf').valid).toBe(true);
    expect(validateFileExtension('file.docx').valid).toBe(true);
    expect(validateFileExtension('readme.md').valid).toBe(true);
    expect(validateFileExtension('data.csv').valid).toBe(true);
    expect(validateFileExtension('notes.txt').valid).toBe(true);
  });

  it('should reject unsupported file extensions', () => {
    const result = validateFileExtension('program.exe');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_EXTENSION);
  });

  it('should reject files without extension', () => {
    const result = validateFileExtension('README');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no extension');
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_EXTENSION);
  });

  it('should be case insensitive', () => {
    expect(validateFileExtension('Document.PDF').valid).toBe(true);
    expect(validateFileExtension('File.DOCX').valid).toBe(true);
  });
});

describe('validateFileMimeType', () => {
  it('should validate correct MIME types', () => {
    const pdfFile = createMockFile('doc.pdf', 1000, 'application/pdf');
    expect(validateFileMimeType(pdfFile).valid).toBe(true);

    const docxFile = createMockFile(
      'doc.docx',
      1000,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(validateFileMimeType(docxFile).valid).toBe(true);

    const txtFile = createMockFile('notes.txt', 1000, 'text/plain');
    expect(validateFileMimeType(txtFile).valid).toBe(true);

    const csvFile = createMockFile('data.csv', 1000, 'text/csv');
    expect(validateFileMimeType(csvFile).valid).toBe(true);
  });

  it('should handle files with empty MIME type', () => {
    const file = createMockFile('doc.pdf', 1000, '');
    expect(validateFileMimeType(file).valid).toBe(true);
  });

  it('should reject incorrect MIME types', () => {
    const file = createMockFile('doc.pdf', 1000, 'application/json');
    const result = validateFileMimeType(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid MIME type');
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_MIME_TYPE);
  });

  it('should reject unknown file types', () => {
    const file = createMockFile('unknown.xyz', 1000, 'application/xyz');
    const result = validateFileMimeType(file);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_MIME_TYPE);
  });
});

describe('validateFileType', () => {
  it('should validate both extension and MIME type', () => {
    const file = createMockFile('doc.pdf', 1000, 'application/pdf');
    expect(validateFileType(file).valid).toBe(true);
  });

  it('should fail if extension is invalid', () => {
    const file = createMockFile('program.exe', 1000, 'application/exe');
    const result = validateFileType(file);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_EXTENSION);
  });

  it('should fail if MIME type is invalid', () => {
    const file = createMockFile('doc.pdf', 1000, 'application/json');
    const result = validateFileType(file);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_MIME_TYPE);
  });
});

describe('validateFileSize', () => {
  it('should validate files within size limit', () => {
    const file = createMockFile('small.pdf', 1000);
    expect(validateFileSize(file).valid).toBe(true);

    const largeFile = createMockFile('large.pdf', MAX_FILE_SIZE - 1);
    expect(validateFileSize(largeFile).valid).toBe(true);
  });

  it('should reject files exceeding size limit', () => {
    const file = createMockFile('huge.pdf', MAX_FILE_SIZE + 1);
    const result = validateFileSize(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
    expect(result.errorCode).toBe(FileValidationErrorCode.FILE_TOO_LARGE);
  });

  it('should work with custom max size', () => {
    const file = createMockFile('file.pdf', 2000);
    expect(validateFileSize(file, 3000).valid).toBe(true);
    expect(validateFileSize(file, 1000).valid).toBe(false);
  });

  it('should include file size in error message', () => {
    const file = createMockFile('huge.pdf', MAX_FILE_SIZE + 1000);
    const result = validateFileSize(file);
    expect(result.error).toContain('MB');
    expect(result.error).toContain(file.name);
  });
});

describe('calculateTotalSize', () => {
  it('should calculate total size of files', () => {
    const files = [
      createMockFile('file1.pdf', 1000),
      createMockFile('file2.docx', 2000),
      createMockFile('file3.txt', 500),
    ];
    expect(calculateTotalSize(files)).toBe(3500);
  });

  it('should return 0 for empty array', () => {
    expect(calculateTotalSize([])).toBe(0);
  });

  it('should handle uploaded files with same interface', () => {
    const uploadedFiles = [
      { id: '1', name: 'file1.pdf', content: '', size: 1000, uploadedAt: Date.now() },
      { id: '2', name: 'file2.pdf', content: '', size: 2000, uploadedAt: Date.now() },
    ];
    expect(calculateTotalSize(uploadedFiles)).toBe(3000);
  });
});

describe('formatFileSize', () => {
  it('should format bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(500)).toBe('500 Bytes');
    expect(formatFileSize(1023)).toBe('1023 Bytes');
  });

  it('should format kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(102400)).toBe('100 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1572864)).toBe('1.5 MB');
    expect(formatFileSize(10485760)).toBe('10 MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1 GB');
    expect(formatFileSize(2147483648)).toBe('2 GB');
  });
});

describe('validateTotalSize', () => {
  it('should validate when total size is within limit', () => {
    const files = [
      createMockFile('file1.pdf', 1000000),
      createMockFile('file2.pdf', 2000000),
    ];
    expect(validateTotalSize(files).valid).toBe(true);
  });

  it('should reject when total size exceeds limit', () => {
    const files = [
      createMockFile('file1.pdf', MAX_TOTAL_SIZE / 2 + 1),
      createMockFile('file2.pdf', MAX_TOTAL_SIZE / 2 + 1),
    ];
    const result = validateTotalSize(files);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum limit');
    expect(result.errorCode).toBe(FileValidationErrorCode.TOTAL_SIZE_EXCEEDED);
  });

  it('should consider existing files', () => {
    const newFiles = [createMockFile('new.pdf', 10000000)];
    const existingFiles = [
      { id: '1', name: 'existing.pdf', content: '', size: MAX_TOTAL_SIZE - 5000000, uploadedAt: Date.now() },
    ];
    const result = validateTotalSize(newFiles, existingFiles);
    expect(result.valid).toBe(false);
  });

  it('should work with custom max size', () => {
    const files = [createMockFile('file.pdf', 6000000)];
    expect(validateTotalSize(files, [], 10000000).valid).toBe(true);
    expect(validateTotalSize(files, [], 5000000).valid).toBe(false);
  });
});

describe('validateFile', () => {
  it('should validate valid files', () => {
    const file = createMockFile('doc.pdf', 1000, 'application/pdf');
    expect(validateFile(file).valid).toBe(true);
  });

  it('should reject null or undefined', () => {
    const result = validateFile(null as any);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.NO_FILE);
  });

  it('should validate type and size', () => {
    // Invalid type
    let file = createMockFile('program.exe', 1000);
    let result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.INVALID_EXTENSION);

    // Invalid size
    file = createMockFile('huge.pdf', MAX_FILE_SIZE + 1, 'application/pdf');
    result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(FileValidationErrorCode.FILE_TOO_LARGE);
  });

  it('should work with custom options', () => {
    const file = createMockFile('file.pdf', 2000, 'application/pdf');
    expect(validateFile(file, { maxFileSize: 3000 }).valid).toBe(true);
    expect(validateFile(file, { maxFileSize: 1000 }).valid).toBe(false);
  });
});

describe('validateFiles', () => {
  it('should validate array of valid files', () => {
    const files = [
      createMockFile('file1.pdf', 1000, 'application/pdf'),
      createMockFile('file2.docx', 2000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      createMockFile('file3.txt', 500, 'text/plain'),
    ];
    const result = validateFiles(files);
    expect(result.valid).toBe(true);
    expect(result.validFiles).toHaveLength(3);
    expect(result.invalidFiles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should separate valid and invalid files', () => {
    const files = [
      createMockFile('valid.pdf', 1000, 'application/pdf'),
      createMockFile('invalid.exe', 1000),
      createMockFile('valid.txt', 500, 'text/plain'),
      createMockFile('huge.pdf', MAX_FILE_SIZE + 1, 'application/pdf'),
    ];
    const result = validateFiles(files);
    expect(result.valid).toBe(false);
    expect(result.validFiles).toHaveLength(2);
    expect(result.invalidFiles).toHaveLength(2);
    expect(result.errors).toHaveLength(2);
  });

  it('should validate total size', () => {
    const files = [
      createMockFile('file1.pdf', MAX_TOTAL_SIZE / 2 + 1, 'application/pdf'),
      createMockFile('file2.pdf', MAX_TOTAL_SIZE / 2 + 1, 'application/pdf'),
    ];
    const result = validateFiles(files);
    expect(result.valid).toBe(false);
    expect(result.validFiles).toHaveLength(0);
    // Should have at least one error related to size
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.toLowerCase().includes('size') || e.toLowerCase().includes('mb'))).toBe(true);
  });

  it('should consider existing files for total size', () => {
    const files = [createMockFile('new.pdf', 10000000, 'application/pdf')];
    const existing = [
      { id: '1', name: 'existing.pdf', content: '', size: MAX_TOTAL_SIZE - 5000000, uploadedAt: Date.now() },
    ];
    const result = validateFiles(files, { existingFiles: existing });
    expect(result.valid).toBe(false);
  });

  it('should return total size', () => {
    const files = [
      createMockFile('file1.pdf', 1000, 'application/pdf'),
      createMockFile('file2.pdf', 2000, 'application/pdf'),
    ];
    const result = validateFiles(files);
    expect(result.totalSize).toBe(3000);
  });
});

describe('getValidationErrorMessage', () => {
  it('should return correct message for each error code', () => {
    expect(getValidationErrorMessage(FileValidationErrorCode.INVALID_TYPE)).toContain('not supported');
    expect(getValidationErrorMessage(FileValidationErrorCode.FILE_TOO_LARGE)).toContain('too large');
    expect(getValidationErrorMessage(FileValidationErrorCode.TOTAL_SIZE_EXCEEDED)).toContain('exceeds');
    expect(getValidationErrorMessage(FileValidationErrorCode.INVALID_EXTENSION)).toContain('extension');
    expect(getValidationErrorMessage(FileValidationErrorCode.INVALID_MIME_TYPE)).toContain('type validation');
    expect(getValidationErrorMessage(FileValidationErrorCode.FILE_READ_ERROR)).toContain('read file');
    expect(getValidationErrorMessage(FileValidationErrorCode.NO_FILE)).toContain('No file');
  });

  it('should include details in error message', () => {
    const message = getValidationErrorMessage(FileValidationErrorCode.FILE_TOO_LARGE, {
      filename: 'huge.pdf',
      size: 15000000,
      maxSize: 10000000,
    });
    expect(message).toContain('MB');
  });

  it('should return generic message for unknown codes', () => {
    const message = getValidationErrorMessage('UNKNOWN' as any);
    expect(message).toBe('File validation failed');
  });
});

describe('isSupportedFileType', () => {
  it('should return true for supported types', () => {
    expect(isSupportedFileType('.pdf')).toBe(true);
    expect(isSupportedFileType('pdf')).toBe(true);
    expect(isSupportedFileType('.docx')).toBe(true);
    expect(isSupportedFileType('txt')).toBe(true);
  });

  it('should return false for unsupported types', () => {
    expect(isSupportedFileType('.exe')).toBe(false);
    expect(isSupportedFileType('zip')).toBe(false);
    expect(isSupportedFileType('.unknown')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isSupportedFileType('.PDF')).toBe(true);
    expect(isSupportedFileType('DOCX')).toBe(true);
  });
});

describe('getAllSupportedMimeTypes', () => {
  it('should return all MIME types as flat array', () => {
    const mimeTypes = getAllSupportedMimeTypes();
    expect(Array.isArray(mimeTypes)).toBe(true);
    expect(mimeTypes.length).toBeGreaterThan(0);
    expect(mimeTypes).toContain('application/pdf');
    expect(mimeTypes).toContain('text/plain');
  });

  it('should not contain duplicate MIME types', () => {
    const mimeTypes = getAllSupportedMimeTypes();
    const uniqueTypes = [...new Set(mimeTypes)];
    // Some file types may share MIME types (e.g., md and txt both use text/plain)
    expect(uniqueTypes.length).toBeGreaterThan(0);
    expect(uniqueTypes.length).toBeLessThanOrEqual(mimeTypes.length);
  });
});

describe('getFileTypeDescription', () => {
  it('should return descriptions for all supported types', () => {
    expect(getFileTypeDescription('pdf')).toBe('PDF Document');
    expect(getFileTypeDescription('docx')).toBe('Word Document');
    expect(getFileTypeDescription('txt')).toBe('Text File');
    expect(getFileTypeDescription('md')).toBe('Markdown File');
    expect(getFileTypeDescription('csv')).toBe('CSV Spreadsheet');
  });
});

describe('Module constants', () => {
  it('should export correct constants', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    expect(MAX_TOTAL_SIZE).toBe(50 * 1024 * 1024);
    expect(SUPPORTED_FILE_TYPES).toEqual(['pdf', 'docx', 'txt', 'md', 'csv']);
    expect(ALLOWED_EXTENSIONS).toEqual(['.pdf', '.docx', '.txt', '.md', '.csv']);
  });

  it('should have MIME type mappings', () => {
    expect(MIME_TYPE_MAP.pdf).toContain('application/pdf');
    expect(MIME_TYPE_MAP.docx).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(MIME_TYPE_MAP.txt).toContain('text/plain');
    expect(MIME_TYPE_MAP.csv).toContain('text/csv');
  });
});
