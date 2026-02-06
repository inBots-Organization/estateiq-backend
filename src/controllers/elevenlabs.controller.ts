/**
 * ElevenLabs Voice Controller
 *
 * REST API endpoints for managing ElevenLabs voice conversations
 * including agent access, conversation history, and performance analysis.
 */

import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { ElevenLabsService } from '../services/elevenlabs/elevenlabs.service';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class ElevenLabsController {
  public router: Router;

  constructor(
    @inject(ElevenLabsService) private elevenLabsService: ElevenLabsService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get agent ID and signed URL for starting a conversation
    this.router.get(
      '/agent',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAgent.bind(this)
    );

    // Get signed URL for WebSocket connection
    this.router.get(
      '/signed-url',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getSignedUrl.bind(this)
    );

    // Save completed conversation
    this.router.post(
      '/conversations/:conversationId/save',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.saveConversation.bind(this)
    );

    // Get conversation details
    this.router.get(
      '/conversations/:conversationId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getConversation.bind(this)
    );

    // Get conversation audio
    this.router.get(
      '/conversations/:conversationId/audio',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getConversationAudio.bind(this)
    );

    // Analyze conversation performance
    this.router.post(
      '/conversations/:conversationId/analyze',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.analyzeConversation.bind(this)
    );

    // Get trainee's conversation history
    this.router.get(
      '/history',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getHistory.bind(this)
    );

    // Get specific saved session
    this.router.get(
      '/sessions/:sessionId',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getSession.bind(this)
    );

    // Get session audio (from saved recording)
    this.router.get(
      '/sessions/:sessionId/audio',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getSessionAudio.bind(this)
    );

    // Retry fetching audio for a session
    this.router.post(
      '/sessions/:sessionId/retry-audio',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.retryFetchAudio.bind(this)
    );
  }

  /**
   * GET /api/elevenlabs/agent
   * Get agent ID for starting a conversation
   */
  private async getAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = await this.elevenLabsService.getAgentId();
      res.status(200).json({ agentId });
    } catch (error) {
      console.error('[ElevenLabsController] getAgent error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/signed-url
   * Get signed URL for secure WebSocket connection
   */
  private async getSignedUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentId = await this.elevenLabsService.getAgentId();
      const signedUrl = await this.elevenLabsService.getSignedUrl(agentId);
      res.status(200).json({ signedUrl, agentId });
    } catch (error) {
      console.error('[ElevenLabsController] getSignedUrl error:', error);
      next(error);
    }
  }

  /**
   * POST /api/elevenlabs/conversations/:conversationId/save
   * Save completed conversation with analysis
   */
  private async saveConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const traineeId = req.user!.userId;

      console.log(`[ElevenLabsController] Saving conversation ${conversationId} for trainee ${traineeId}`);

      // Analyze the conversation (service handles waiting for transcript to be ready)
      const analysis = await this.elevenLabsService.analyzePerformance(conversationId);
      console.log(`[ElevenLabsController] Analysis complete with score: ${analysis.overallScore}`);

      // Save to database
      const sessionId = await this.elevenLabsService.saveConversationRecord(
        traineeId,
        conversationId,
        analysis
      );
      console.log(`[ElevenLabsController] Successfully saved session ${sessionId}`);

      res.status(201).json({
        sessionId,
        conversationId,
        analysis,
      });
    } catch (error) {
      console.error('[ElevenLabsController] saveConversation error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/conversations/:conversationId
   * Get conversation details from ElevenLabs
   */
  private async getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const conversation = await this.elevenLabsService.getConversation(conversationId);
      res.status(200).json(conversation);
    } catch (error) {
      console.error('[ElevenLabsController] getConversation error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/conversations/:conversationId/audio
   * Get conversation audio recording
   */
  private async getConversationAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const audioBuffer = await this.elevenLabsService.getConversationAudio(conversationId);

      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Disposition', `attachment; filename="conversation-${conversationId}.mp3"`);
      res.send(audioBuffer);
    } catch (error) {
      console.error('[ElevenLabsController] getConversationAudio error:', error);
      next(error);
    }
  }

  /**
   * POST /api/elevenlabs/conversations/:conversationId/analyze
   * Analyze conversation performance
   */
  private async analyzeConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversationId } = req.params;
      const analysis = await this.elevenLabsService.analyzePerformance(conversationId);
      res.status(200).json(analysis);
    } catch (error) {
      console.error('[ElevenLabsController] analyzeConversation error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/history
   * Get trainee's conversation history
   */
  private async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const history = await this.elevenLabsService.getTraineeConversations(traineeId);
      res.status(200).json({ sessions: history });
    } catch (error) {
      console.error('[ElevenLabsController] getHistory error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/sessions/:sessionId
   * Get specific saved session with full details
   */
  private async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const session = await this.elevenLabsService.getSessionById(sessionId);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.status(200).json(session);
    } catch (error) {
      console.error('[ElevenLabsController] getSession error:', error);
      next(error);
    }
  }

  /**
   * GET /api/elevenlabs/sessions/:sessionId/audio
   * Get saved session audio recording
   */
  private async getSessionAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const audioBuffer = await this.elevenLabsService.getSessionAudio(sessionId);

      if (!audioBuffer) {
        res.status(404).json({ error: 'Audio not available for this session' });
        return;
      }

      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Disposition', `inline; filename="session-${sessionId}.mp3"`);
      res.send(audioBuffer);
    } catch (error) {
      console.error('[ElevenLabsController] getSessionAudio error:', error);
      next(error);
    }
  }

  /**
   * POST /api/elevenlabs/sessions/:sessionId/retry-audio
   * Retry fetching audio for a session that doesn't have it
   */
  private async retryFetchAudio(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      const success = await this.elevenLabsService.retryFetchAudio(sessionId);

      if (success) {
        res.status(200).json({ message: 'Audio fetched successfully' });
      } else {
        res.status(400).json({ error: 'Could not fetch audio' });
      }
    } catch (error) {
      console.error('[ElevenLabsController] retryFetchAudio error:', error);
      next(error);
    }
  }
}
