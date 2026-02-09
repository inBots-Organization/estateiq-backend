/**
 * AI Teacher Controller
 *
 * REST API endpoints for the AI Teacher feature.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'tsyringe';
import { AITeacherService } from '../services/ai-teacher/ai-teacher.service';
import { AVContentService } from '../services/av-content/av-content.service';
import { authMiddleware } from '../middleware/auth.middleware';
import multer, { FileFilterCallback } from 'multer';

// Extend Request type to include file property
interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

// Configure multer for file uploads (single and multiple)
const uploadConfig = {
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max per file
    files: 5, // Max 5 files at once
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow specific file types including images and presentations
    const allowedTypes = [
      // Documents
      'application/pdf',
      'text/plain',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // PowerPoint
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];

    // Also allow any image type
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Allowed types: PDF, Word, PowerPoint, images, text.`));
    }
  },
};

const upload = multer(uploadConfig);
const uploadMultiple = multer(uploadConfig).array('files', 5);

// Configure multer for audio uploads
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max for audio
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Allow audio file types
    const allowedTypes = [
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/mp4',
      'audio/m4a',
    ];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Audio file type not allowed'));
    }
  },
});

@injectable()
export class AITeacherController {
  public router: Router;

  constructor(
    @inject(AITeacherService) private aiTeacherService: AITeacherService,
    @inject(AVContentService) private avContentService: AVContentService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Profile endpoints
    this.router.get(
      '/profile',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getProfile.bind(this)
    );

    this.router.patch(
      '/profile',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.updateProfile.bind(this)
    );

    this.router.post(
      '/profile/sync',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.syncProfile.bind(this)
    );

    // Chat endpoints
    this.router.get(
      '/welcome',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getWelcome.bind(this)
    );

    this.router.post(
      '/chat',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.sendMessage.bind(this)
    );

    // Streaming chat endpoint for real-time responses
    this.router.post(
      '/chat/stream',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.sendMessageStream.bind(this)
    );

    this.router.get(
      '/history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getHistory.bind(this)
    );

    // Voice endpoints
    this.router.post(
      '/tts',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.textToSpeech.bind(this)
    );

    // Pre-render TTS for streaming - generates audio for first sentence quickly
    this.router.post(
      '/tts/prerender',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.preRenderTTS.bind(this)
    );

    this.router.post(
      '/stt',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      audioUpload.single('audio'),
      this.speechToText.bind(this)
    );

    // File upload endpoint (single file)
    this.router.post(
      '/upload',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      upload.single('file'),
      this.uploadFile.bind(this)
    );

    // Multi-file upload endpoint (up to 5 files)
    this.router.post(
      '/upload-multiple',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      uploadMultiple,
      this.uploadMultipleFiles.bind(this)
    );

    // Gemini-powered educational content endpoints
    this.router.post(
      '/lesson-summary',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.generateLessonSummary.bind(this)
    );

    this.router.post(
      '/mini-quiz',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.generateMiniQuiz.bind(this)
    );

    this.router.post(
      '/video-timestamps',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.generateVideoTimestamps.bind(this)
    );

    // ============================================================================
    // AV CONTENT GENERATION ENDPOINTS
    // ============================================================================

    // Generate video lecture
    this.router.post(
      '/av/generate-lecture',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.generateAVLecture.bind(this)
    );

    // Generate audio summary
    this.router.post(
      '/av/generate-summary',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.generateAVSummary.bind(this)
    );

    // Get specific AV content with slides
    this.router.get(
      '/av/content/:id',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAVContent.bind(this)
    );

    // List user's AV content
    this.router.get(
      '/av/content',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.listAVContent.bind(this)
    );

    // Submit feedback for AV content
    this.router.post(
      '/av/content/:id/feedback',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.submitAVFeedback.bind(this)
    );

    // Delete AV content
    this.router.delete(
      '/av/content/:id',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.deleteAVContent.bind(this)
    );
  }

  // ============================================================================
  // PROFILE ENDPOINTS
  // ============================================================================

  private async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const profile = await this.aiTeacherService.getOrCreateProfile(traineeId);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  private async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const updates = req.body;

      // Validate allowed updates
      const allowedFields = [
        'personalityTraits',
        'preferredLearningStyle',
        'communicationPreference',
        'language',
        'likes',
        'dislikes',
      ];

      const filteredUpdates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          filteredUpdates[field] = updates[field];
        }
      }

      const profile = await this.aiTeacherService.updateProfile(traineeId, filteredUpdates);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  private async syncProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const profile = await this.aiTeacherService.syncProfileWithPerformance(traineeId);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  // ============================================================================
  // CHAT ENDPOINTS
  // ============================================================================

  private async getWelcome(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const welcome = await this.aiTeacherService.generateWelcome(traineeId);
      res.status(200).json(welcome);
    } catch (error) {
      next(error);
    }
  }

  private async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { message, attachments, lessonContext } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const response = await this.aiTeacherService.sendMessage(traineeId, message, attachments, lessonContext);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stream chat responses using Server-Sent Events (SSE)
   * Delivers AI responses chunk by chunk for real-time UI updates
   */
  private async sendMessageStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { message, attachments, lessonContext } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
      res.flushHeaders();

      // Stream the response
      for await (const chunk of this.aiTeacherService.sendMessageStream(
        traineeId,
        message,
        attachments,
        lessonContext
      )) {
        // Send as SSE event
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        // Flush immediately for real-time delivery
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }

        // Break if done or error
        if (chunk.type === 'done' || chunk.type === 'error') {
          break;
        }
      }

      // End the stream
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('[AITeacherController] Streaming error:', error);
      // If headers already sent, end the stream
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream error occurred' })}\n\n`);
        res.end();
      } else {
        next(error);
      }
    }
  }

  private async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const limit = parseInt(req.query.limit as string) || 10;

      const history = await this.aiTeacherService.getSessionHistory(traineeId, limit);
      res.status(200).json(history);
    } catch (error) {
      next(error);
    }
  }

  // ============================================================================
  // VOICE ENDPOINTS
  // ============================================================================

  private async textToSpeech(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, language } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Text is required' });
        return;
      }

      const lang = language === 'en' ? 'en' : 'ar';
      const audioBase64 = await this.aiTeacherService.textToSpeech(text, lang);

      res.status(200).json({ audio: audioBase64 });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Pre-render TTS for first sentence during streaming
   * Extracts and generates audio for the first complete sentence
   */
  private async preRenderTTS(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text, language } = req.body;

      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Text is required' });
        return;
      }

      // Extract first sentence (look for sentence-ending punctuation)
      const sentenceEndMatch = text.match(/^(.*?[.!?؟\n])/);
      const firstSentence = sentenceEndMatch ? sentenceEndMatch[1].trim() : text.slice(0, 150).trim();

      if (firstSentence.length < 10) {
        res.status(400).json({ error: 'Text too short for pre-rendering' });
        return;
      }

      const lang = language === 'en' ? 'en' : 'ar';
      const audioBase64 = await this.aiTeacherService.textToSpeech(firstSentence, lang);

      res.status(200).json({
        audio: audioBase64,
        text: firstSentence,
        isPartial: sentenceEndMatch !== null,
      });
    } catch (error) {
      next(error);
    }
  }

  private async speechToText(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No audio file uploaded' });
        return;
      }

      const language = (req.body.language === 'en' ? 'en' : 'ar') as 'ar' | 'en';

      console.log('[AITeacherController] Received audio file:', {
        size: req.file.size,
        mimetype: req.file.mimetype,
        language,
      });

      const text = await this.aiTeacherService.speechToText(req.file.buffer, language);

      res.status(200).json({ text });
    } catch (error) {
      console.error('[AITeacherController] Speech-to-text error:', error);
      next(error);
    }
  }

  // ============================================================================
  // FILE UPLOAD
  // ============================================================================

  private async uploadFile(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const attachment = await this.aiTeacherService.processUploadedFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      res.status(200).json(attachment);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handle multiple file uploads (up to 5 files)
   * Supports images, PDFs, Word docs, PowerPoints
   */
  private async uploadMultipleFiles(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      console.log(`[AITeacherController] Processing ${files.length} files`);

      // Process all files in parallel
      const attachments = await Promise.all(
        files.map(async (file) => {
          try {
            return await this.aiTeacherService.processUploadedFile(
              file.buffer,
              file.originalname,
              file.mimetype
            );
          } catch (error) {
            console.error(`[AITeacherController] Error processing file ${file.originalname}:`, error);
            // Return error object for failed files
            return {
              id: `error-${Date.now()}`,
              filename: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              error: error instanceof Error ? error.message : 'Failed to process file',
            };
          }
        })
      );

      res.status(200).json({ attachments, count: attachments.length });
    } catch (error) {
      next(error);
    }
  }

  // ============================================================================
  // GEMINI-POWERED EDUCATIONAL CONTENT
  // ============================================================================

  private async generateLessonSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lessonContext, language } = req.body;

      console.log('[AITeacherController] generateLessonSummary called with:', {
        hasLessonContext: !!lessonContext,
        lessonName: lessonContext?.lessonName,
        lessonNameAr: lessonContext?.lessonNameAr,
        language,
      });

      if (!lessonContext) {
        res.status(400).json({ error: 'Lesson context is required' });
        return;
      }

      const summary = await this.aiTeacherService.generateLessonSummary(
        lessonContext,
        language || 'ar'
      );

      res.status(200).json(summary);
    } catch (error) {
      console.error('[AITeacherController] generateLessonSummary error:', error);
      next(error);
    }
  }

  private async generateMiniQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lessonContext, language, numQuestions } = req.body;

      console.log('[AITeacherController] generateMiniQuiz called with:', {
        hasLessonContext: !!lessonContext,
        lessonName: lessonContext?.lessonName,
        lessonNameAr: lessonContext?.lessonNameAr,
        language,
        numQuestions,
      });

      if (!lessonContext) {
        res.status(400).json({ error: 'Lesson context is required' });
        return;
      }

      const quiz = await this.aiTeacherService.generateMiniQuiz(
        lessonContext,
        language || 'ar',
        numQuestions || 3
      );

      res.status(200).json(quiz);
    } catch (error) {
      console.error('[AITeacherController] generateMiniQuiz error:', error);
      next(error);
    }
  }

  private async generateVideoTimestamps(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lessonContext, question, language } = req.body;

      if (!lessonContext) {
        res.status(400).json({ error: 'Lesson context is required' });
        return;
      }

      const timestamps = await this.aiTeacherService.generateVideoTimestamps(
        lessonContext,
        question || '',
        language || 'ar'
      );

      res.status(200).json(timestamps);
    } catch (error) {
      next(error);
    }
  }

  // ============================================================================
  // AV CONTENT GENERATION ENDPOINTS
  // ============================================================================

  /**
   * Generate a video lecture with slides and audio
   * POST /api/ai-teacher/av/generate-lecture
   */
  private async generateAVLecture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { topic, lessonContext, courseId, duration, language } = req.body;

      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic is required' });
        return;
      }

      console.log('[AITeacherController] Generating AV lecture:', {
        traineeId,
        topic,
        duration,
        language,
      });

      const content = await this.avContentService.generateLecture({
        traineeId,
        topic,
        lessonContext,
        courseId,
        duration: duration || 10,
        language: language || 'ar',
      });

      res.status(200).json(content);
    } catch (error) {
      console.error('[AITeacherController] Generate lecture error:', error);
      next(error);
    }
  }

  /**
   * Generate an audio summary focused on weak areas
   * POST /api/ai-teacher/av/generate-summary
   */
  private async generateAVSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { topic, sourceText, focusAreas, language } = req.body;

      if (!topic || typeof topic !== 'string') {
        res.status(400).json({ error: 'Topic is required' });
        return;
      }

      console.log('[AITeacherController] Generating AV summary:', {
        traineeId,
        topic,
        hasFocusAreas: !!focusAreas,
        language,
      });

      const content = await this.avContentService.generateSummary({
        traineeId,
        topic,
        sourceText,
        focusAreas,
        language: language || 'ar',
      });

      res.status(200).json(content);
    } catch (error) {
      console.error('[AITeacherController] Generate summary error:', error);
      next(error);
    }
  }

  /**
   * Get specific AV content with all slides
   * GET /api/ai-teacher/av/content/:id
   */
  private async getAVContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const contentId = req.params.id;

      const content = await this.avContentService.getContent(contentId, traineeId);
      res.status(200).json(content);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List user's AV content with pagination
   * GET /api/ai-teacher/av/content
   */
  private async listAVContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const type = req.query.type as 'lecture' | 'summary' | undefined;

      const result = await this.avContentService.listContent(traineeId, {
        page,
        limit,
        type,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Submit feedback for AV content
   * POST /api/ai-teacher/av/content/:id/feedback
   */
  private async submitAVFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const contentId = req.params.id;
      const { rating, helpful, comment, watchDuration, completedSlides } = req.body;

      await this.avContentService.submitFeedback({
        contentId,
        traineeId,
        rating,
        helpful,
        comment,
        watchDuration,
        completedSlides,
      });

      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete AV content
   * DELETE /api/ai-teacher/av/content/:id
   */
  private async deleteAVContent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const contentId = req.params.id;

      await this.avContentService.deleteContent(contentId, traineeId);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
