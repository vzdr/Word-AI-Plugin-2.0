/**
 * AI Query Route
 * POST /api/ai/query
 *
 * Now supports RAG (Retrieval-Augmented Generation) when files are uploaded
 */

import { Router, Request, Response } from 'express';
import { Part } from '@google/generative-ai';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { createOpenAIService } from '../services/openai';
import { createGeminiService } from '../services/gemini';
import config from '../config/env';
import { UploadedFile } from '../types/UploadedFile';
import { createRAGService, RAGRequest } from '../services/rag';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
});

/**
 * POST /api/ai/query
 * Supports both regular AI queries and RAG-enhanced queries with uploaded files
 */
router.post(
  '/query',
  upload.array('files'),
  [
    body('selectedText').notEmpty().trim(),
    body('settings').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { selectedText, inlineContext = '' } = req.body;
      const settings = JSON.parse(req.body.settings);
      const files = req.files as Express.Multer.File[];

      const contextFiles: UploadedFile[] = files.map((file) => ({
        name: file.originalname,
        content: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      }));

      const startTime = Date.now();

      // Determine if we should use RAG (if files are uploaded and query is not a table operation)
      let useRAG = contextFiles.length > 0 && !inlineContext.includes('You are a table cell processor');

      let completion;
      let ragMetrics;
      let ragSources;

      if (useRAG) {
        console.log(`[AI Query] Using RAG with ${contextFiles.length} files`);

        // Initialize RAG service
        const apiKey = config.aiProvider === 'gemini' ? config.gemini.apiKey : config.openai.apiKey;
        const ragService = createRAGService(apiKey, {
          topK: 5,
          minSimilarity: 0.3,
          chunkSize: 600,
          chunkOverlap: 100,
        });

        try {
          // Index files
          await ragService.indexFiles(contextFiles);

          // Execute RAG query
          const ragRequest: RAGRequest = {
            query: selectedText,
            documents: [],
            inlineContext,
            config: {
              topK: 5,
              minSimilarity: 0.3,
            },
            modelSettings: settings,
          };

          const ragResponse = await ragService.query(ragRequest);

          // Build augmented context with retrieved chunks
          const augmentedContext = (ragService as any).pipeline.buildContext(
            ragResponse.retrievedChunks,
            inlineContext
          );

          console.log(`[AI Query] RAG retrieved ${ragResponse.retrievedChunks.length} chunks`);

          // Build prompt with RAG context
          const systemPrompt = contextFiles.length > 0
            ? `You are a specialized assistant for answering questions based ONLY on the provided context from the attached files. Your task is to analyze the user's question and the content of the files.

- If you can find the answer within the files, provide a comprehensive answer based exclusively on that information.
- If the answer cannot be found in the provided files, you MUST respond with the exact phrase: "INFO NOT FOUND".
- Do not use any external knowledge or information outside of the provided file content.`
            : `You are a helpful AI assistant. Please answer the user's question accurately and concisely.`;

          const userPrompt = `${augmentedContext}\n\nUser Question: ${selectedText}`;

          // Generate response using AI service
          if (config.aiProvider === 'gemini') {
            const gemini = createGeminiService(config.gemini.apiKey);
            completion = await gemini.processRequest({
              question: userPrompt,
              contextFiles: [], // Context already in prompt
              inlineContext: systemPrompt,
              settings,
            });
          } else {
            const openai = createOpenAIService(config.openai.apiKey);
            completion = await openai.processRequest({
              question: userPrompt,
              contextFiles: [], // Context already in prompt
              inlineContext: systemPrompt,
              settings,
            });
          }

          // Add RAG metadata
          ragMetrics = ragResponse.metrics;
          ragSources = ragResponse.sources;

          // Clean up
          await ragService.clear();
        } catch (ragError: any) {
          console.error('[AI Query] RAG error, falling back to non-RAG:', ragError);
          // Fall back to non-RAG processing
          useRAG = false;
        }
      }

      if (!useRAG) {
        console.log('[AI Query] Using standard AI processing');

        // Build prompt
        let prompt = selectedText;
        if (inlineContext) {
          prompt = `Context: ${inlineContext}\n\nQuestion: ${selectedText}`;
        }

        // Initialize AI service based on provider
        if (config.aiProvider === 'gemini') {
          const gemini = createGeminiService(config.gemini.apiKey);
          completion = await gemini.processRequest({
            question: prompt,
            contextFiles,
            inlineContext,
            settings,
          });
        } else {
          const openai = createOpenAIService(config.openai.apiKey);
          completion = await openai.processRequest({
            question: prompt,
            contextFiles,
            inlineContext,
            settings,
          });
        }
      }

      // Ensure completion is defined
      if (!completion) {
        throw new Error('Failed to generate completion');
      }

      const responsePayload: any = {
        response: completion.answer,
        model: settings.model,
        usage: (completion as any).usage,
        processingTime: Date.now() - startTime,
      };

      // Add RAG metadata if available
      if (useRAG && ragMetrics) {
        responsePayload.rag = {
          enabled: true,
          metrics: ragMetrics,
          sources: ragSources,
        };
      }

      return res.json(responsePayload);
    } catch (error: any) {
      console.error('[AI Query] Error details:', {
        message: error.message,
        type: error.type,
        statusCode: error.statusCode,
        stack: error.stack,
      });

      const statusCode = error.statusCode || error.status || 500;
      const errorMessage = error.message || 'Unknown error occurred';

      const errorResponse = {
        error: 'AI request failed',
        message: errorMessage,
        type: error.type || 'UNKNOWN_ERROR',
      };

      console.error('[AI Query] Sending error response:', errorResponse);
      return res.status(statusCode).json(errorResponse);
    }
  }
);

router.get('/test-gemini', async (req: Request, res: Response) => {
  console.log('[Test Route] Received request. Initializing Gemini service...');
  try {
    const gemini = createGeminiService(config.gemini.apiKey);
    const model = gemini['getModel']('gemini-1.0-pro'); // Accessing private method for test

    console.log('[Test Route] Gemini service initialized. Preparing parts...');

    // Create a fake file part (inlineData)
    const fakeFilePart = {
      inlineData: {
        data: Buffer.from("This is the content of a fake file.").toString('base64'),
        mimeType: 'text/plain',
      },
    };

    const textPart = {
      text: "What is in the provided file?",
    };

    const parts: Part[] = [textPart, fakeFilePart];

    console.log('[Test Route] Parts prepared. Calling generateContent...');

    // Set a shorter timeout for the test
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Test request timed out after 30 seconds')), 30000)
    );

    const generatePromise = model.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const result = await Promise.race([generatePromise, timeoutPromise]);

    // @ts-ignore
    const responseText = await result.response.text();

    console.log('[Test Route] Successfully received response from Gemini:', responseText);
    res.status(200).json({ success: true, response: responseText });

  } catch (error: any) {
    console.error('[Test Route] An error occurred:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;