/**
 * AI Query Route
 * POST /api/ai/query
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { createOpenAIService } from '../services/openai';
import { createGeminiService } from '../services/gemini';
import config from '../config/env';
import { UploadedFile } from '../types/UploadedFile';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
});

/**
 * POST /api/ai/query
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

      // Build prompt
      let prompt = selectedText;
      if (inlineContext) {
        prompt = `Context: ${inlineContext}\n\nQuestion: ${selectedText}`;
      }

      // Prepare context files
      const contextFiles: UploadedFile[] = files.map((file) => ({
        name: file.originalname,
        content: file.buffer.toString('base64'),
      }));

      // Initialize AI service based on provider
      let completion;
      const startTime = Date.now();

      if (config.aiProvider === 'gemini') {
        // Use Gemini
        const gemini = createGeminiService(config.gemini.apiKey);
        completion = await gemini.processRequest({
          question: prompt,
          contextFiles,
          inlineContext,
          settings,
        });
      } else {
        // Use OpenAI
        const openai = createOpenAIService(config.openai.apiKey);
        completion = await openai.processRequest({
          question: prompt,
          contextFiles,
          inlineContext,
          settings,
        });
      }

      return res.json({
        response: completion.answer,
        model: settings.model,
        usage: completion.usage,
        processingTime: Date.now() - startTime,
      });
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

export default router;
