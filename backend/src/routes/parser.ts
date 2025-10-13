/**
 * File Parser Endpoint for Word AI Plugin Backend
 *
 * Provides API endpoints for parsing uploaded files
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/errorHandler';
import {
  PdfParser,
  DocxParser,
  TextParser,
  MarkdownParser,
  CsvParser,
  FileType,
  ParsedContent,
  ParserOptions,
} from '../parsers';
import {
  ValidationError,
  UnsupportedFileTypeError,
} from '../types/errors';

const router = Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB default limit
  },
});

// Initialize all parsers
const parsers = {
  pdf: new PdfParser(),
  docx: new DocxParser(),
  txt: new TextParser(),
  md: new MarkdownParser(),
  csv: new CsvParser(),
};

/**
 * Get appropriate parser based on file extension
 */
function getParserForFile(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return { parser: parsers.pdf, fileType: FileType.PDF };
    case 'docx':
      return { parser: parsers.docx, fileType: FileType.DOCX };
    case 'txt':
      return { parser: parsers.txt, fileType: FileType.TXT };
    case 'md':
    case 'markdown':
      return { parser: parsers.md, fileType: FileType.MD };
    case 'csv':
      return { parser: parsers.csv, fileType: FileType.CSV };
    default:
      return null;
  }
}

/**
 * Parse options interface for API request
 */
interface ParseRequestBody {
  enableChunking?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  extractMetadata?: boolean;
  encoding?: string;
  csvOptions?: {
    delimiter?: string;
    hasHeaders?: boolean;
  };
}

/**
 * POST /api/parser/parse
 *
 * Parse an uploaded file and return extracted content
 *
 * @body {ParseRequestBody} options - Parsing options (optional)
 * @file file - The file to parse (multipart/form-data)
 * @returns {ParsedContent} Parsed file content with metadata
 *
 * Supported file types: PDF, DOCX, TXT, MD, CSV
 */
router.post(
  '/parse',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    // Validate file upload
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { originalname, buffer, size } = req.file;

    // Get parser for file type
    const parserInfo = getParserForFile(originalname);
    if (!parserInfo) {
      const ext = originalname.split('.').pop();
      throw new UnsupportedFileTypeError(
        `File type '.${ext}' is not supported. Supported types: PDF, DOCX, TXT, MD, CSV`
      );
    }

    const { parser, fileType } = parserInfo;

    // Parse options from request body
    const options: ParserOptions = {
      maxFileSizeBytes: 10 * 1024 * 1024,
      enableChunking: req.body.enableChunking === 'true' || req.body.enableChunking === true,
      chunkSize: req.body.chunkSize ? parseInt(req.body.chunkSize, 10) : undefined,
      chunkOverlap: req.body.chunkOverlap ? parseInt(req.body.chunkOverlap, 10) : undefined,
      extractMetadata: req.body.extractMetadata !== 'false' && req.body.extractMetadata !== false, // Default true
      encoding: req.body.encoding,
      csvOptions: req.body.csvOptions,
    };

    // Parse the file
    const result: ParsedContent = await parser.parse(buffer, originalname, options);

    // Return parsed content
    res.status(200).json({
      success: true,
      fileType,
      fileName: originalname,
      fileSize: size,
      result,
    });
  })
);

/**
 * GET /api/parser/supported
 *
 * Returns list of supported file types
 *
 * @returns {object} List of supported file extensions and their descriptions
 */
router.get(
  '/supported',
  asyncHandler(async (req: Request, res: Response) => {
    const supportedTypes = [
      {
        extension: 'pdf',
        mimeType: 'application/pdf',
        description: 'PDF documents',
        features: ['Text extraction', 'Metadata', 'Page count', 'Password detection'],
      },
      {
        extension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        description: 'Microsoft Word documents',
        features: ['Text extraction', 'Metadata', 'Document properties'],
      },
      {
        extension: 'txt',
        mimeType: 'text/plain',
        description: 'Plain text files',
        features: ['Encoding detection', 'Text normalization'],
      },
      {
        extension: 'md',
        mimeType: 'text/markdown',
        description: 'Markdown files',
        features: ['Structure extraction', 'Heading detection', 'Link extraction'],
      },
      {
        extension: 'csv',
        mimeType: 'text/csv',
        description: 'Comma-separated values',
        features: ['Delimiter detection', 'Header parsing', 'Structured data'],
      },
    ];

    res.status(200).json({
      success: true,
      supportedTypes,
      maxFileSizeBytes: 10 * 1024 * 1024,
    });
  })
);

/**
 * POST /api/parser/validate
 *
 * Validate a file without fully parsing it
 *
 * @file file - The file to validate (multipart/form-data)
 * @returns {object} Validation result with file type and basic info
 */
router.post(
  '/validate',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const { originalname, buffer, size, mimetype } = req.file;

    // Get parser info
    const parserInfo = getParserForFile(originalname);
    if (!parserInfo) {
      const ext = originalname.split('.').pop();
      throw new UnsupportedFileTypeError(
        `File type '.${ext}' is not supported`
      );
    }

    const { parser, fileType } = parserInfo;

    // Validate file
    try {
      await parser.validate(buffer, originalname);

      res.status(200).json({
        success: true,
        valid: true,
        fileName: originalname,
        fileSize: size,
        fileType,
        mimeType: mimetype,
      });
    } catch (error: any) {
      res.status(200).json({
        success: true,
        valid: false,
        fileName: originalname,
        fileSize: size,
        error: error.message,
      });
    }
  })
);

export default router;
