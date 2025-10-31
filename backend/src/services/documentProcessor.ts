/**
 * Document Processor for RAG
 *
 * Handles document parsing, chunking, and preparation for indexing
 * Integrates with existing file parsers and text chunker
 */

import { RAGDocument, DocumentChunk, RAGConfig, RAGErrorType, RAGError } from '../types/rag';
import { chunkText } from '../utils/textChunker';
import { UploadedFile } from '../types/UploadedFile';
import { ParserResult } from '../types/parser';
import { EmbeddingService } from '../types/rag';
import { v4 as uuidv4 } from 'uuid';
import { parseFile } from '../parsers';

/**
 * Document Processor
 */
export class DocumentProcessor {
  private embeddingService: EmbeddingService;
  private config: RAGConfig;

  constructor(embeddingService: EmbeddingService, config: RAGConfig) {
    this.embeddingService = embeddingService;
    this.config = config;
  }

  /**
   * Process uploaded files into RAG documents
   */
  async processFiles(files: UploadedFile[]): Promise<RAGDocument[]> {
    try {
      console.log(`[Document Processor] Processing ${files.length} files`);

      const documents: RAGDocument[] = [];

      for (const file of files) {
        try {
          const doc = await this.processFile(file);
          documents.push(doc);
        } catch (error: any) {
          console.error(`[Document Processor] Error processing file ${file.name}:`, error);
          // Continue processing other files
        }
      }

      console.log(`[Document Processor] Successfully processed ${documents.length}/${files.length} files`);

      return documents;
    } catch (error: any) {
      throw this.createError(
        `Failed to process files: ${error.message}`,
        RAGErrorType.PARSING_ERROR,
        error
      );
    }
  }

  /**
   * Process a single file into a RAG document
   */
  async processFile(file: UploadedFile): Promise<RAGDocument> {
    try {
      console.log(`[Document Processor] Processing file: ${file.name}`);

      // Parse file content
      const parseResult = await this.parseFileContent(file);

      if (!parseResult.text || parseResult.text.length === 0) {
        throw this.createError(
          `Failed to parse file ${file.name}: No text content extracted`,
          RAGErrorType.PARSING_ERROR
        );
      }

      const content = parseResult.text;

      // Create base document
      const documentId = uuidv4();
      const document: RAGDocument = {
        id: documentId,
        fileName: file.name,
        fileType: this.getFileType(file.name),
        content: content,
        mimeType: file.mimeType,
        metadata: {
          uploadedAt: Date.now(),
          fileSize: Buffer.from(file.content, 'base64').length,
          characterCount: content.length,
        },
      };

      // Chunk the document
      const chunks = await this.chunkDocument(document);
      document.chunks = chunks;

      console.log(`[Document Processor] Created ${chunks.length} chunks for ${file.name}`);

      return document;
    } catch (error: any) {
      throw this.createError(
        `Failed to process file ${file.name}: ${error.message}`,
        RAGErrorType.PARSING_ERROR,
        error
      );
    }
  }

  /**
   * Parse file content using existing parsers
   */
  private async parseFileContent(file: UploadedFile): Promise<ParserResult> {
    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(file.content, 'base64');

      // Use existing parser infrastructure
      const result = await parseFile(buffer, file.name, file.mimeType);

      return result;
    } catch (error: any) {
      // Return error in ParserResult format
      throw this.createError(
        `Failed to parse file ${file.name}: ${error.message}`,
        RAGErrorType.PARSING_ERROR,
        error
      );
    }
  }

  /**
   * Chunk a document and generate embeddings for each chunk
   */
  private async chunkDocument(document: RAGDocument): Promise<DocumentChunk[]> {
    try {
      // Chunk the text
      const textChunks = chunkText(document.content, {
        chunkSize: this.config.chunkSize,
        overlap: this.config.chunkOverlap,
        breakAtSentences: true,
        breakAtWords: true,
        minChunkSize: 100,
      });

      console.log(`[Document Processor] Created ${textChunks.length} text chunks`);

      // Extract chunk texts
      const chunkTexts = textChunks.map((chunk) => chunk.text);

      // Generate embeddings for all chunks
      console.log(`[Document Processor] Generating embeddings for ${chunkTexts.length} chunks`);
      const embeddings = await this.embeddingService.generateEmbeddings(chunkTexts);

      // Create DocumentChunk objects
      const documentChunks: DocumentChunk[] = textChunks.map((textChunk, index) => {
        const chunkId = `${document.id}-chunk-${index}`;

        return {
          id: chunkId,
          text: textChunk.text,
          embedding: embeddings[index],
          source: {
            fileName: document.fileName,
            fileType: document.fileType,
            chunkIndex: index,
            totalChunks: textChunks.length,
            startOffset: textChunk.startOffset,
            endOffset: textChunk.endOffset,
          },
          metadata: {
            createdAt: Date.now(),
          },
        };
      });

      console.log(`[Document Processor] Generated embeddings for ${documentChunks.length} chunks`);

      return documentChunks;
    } catch (error: any) {
      throw this.createError(
        `Failed to chunk document ${document.fileName}: ${error.message}`,
        RAGErrorType.EMBEDDING_ERROR,
        error
      );
    }
  }

  /**
   * Get file type from file name
   */
  private getFileType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ext;
  }

  /**
   * Create a RAG error
   */
  private createError(message: string, type: RAGErrorType, details?: any): RAGError {
    return {
      message,
      type,
      details,
    };
  }

  /**
   * Validate that documents can be processed
   */
  validateFiles(files: UploadedFile[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (files.length === 0) {
      errors.push('No files provided');
    }

    if (files.length > this.config.maxDocuments) {
      errors.push(
        `Too many files: ${files.length} (max: ${this.config.maxDocuments})`
      );
    }

    for (const file of files) {
      if (!file.content || file.content.length === 0) {
        errors.push(`File ${file.name} has no content`);
      }

      if (!file.name || file.name.length === 0) {
        errors.push('File has no name');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create a document processor instance
 */
export function createDocumentProcessor(
  embeddingService: EmbeddingService,
  config: RAGConfig
): DocumentProcessor {
  return new DocumentProcessor(embeddingService, config);
}
