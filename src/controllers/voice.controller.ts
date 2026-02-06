/**
 * Voice/Chat Controller
 *
 * REST API endpoints for text-based chat simulations used in course practice.
 * This handles the conversation flow between trainee and AI client.
 * Sessions are saved to the database for reporting.
 */

import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ILLMProvider } from '../providers/llm/llm-provider.interface';

interface VoiceCallMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface CallSession {
  callId: string;
  traineeId: string;
  courseId?: string;
  context?: string;
  language: 'en' | 'ar';
  messages: VoiceCallMessage[];
  startTime: Date;
  status: 'active' | 'ended';
}

// In-memory session storage (for active sessions)
const sessions: Map<string, CallSession> = new Map();

@injectable()
export class VoiceController {
  public router: Router;

  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider,
    @inject('PrismaClient') private prisma: PrismaClient
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Get voice service status
    this.router.get(
      '/status',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getStatus.bind(this)
    );

    // Start a new call/chat session
    this.router.post(
      '/start',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.startCall.bind(this)
    );

    // Send a message in an active call
    this.router.post(
      '/:callId/message',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.sendMessage.bind(this)
    );

    // End a call
    this.router.post(
      '/:callId/end',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.endCall.bind(this)
    );

    // Get call state
    this.router.get(
      '/:callId/state',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getCallState.bind(this)
    );

    // Text to speech (placeholder)
    this.router.post(
      '/tts',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.textToSpeech.bind(this)
    );
  }

  /**
   * GET /api/voice/status
   */
  private async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        voiceServiceAvailable: true,
        provider: 'LLM',
        message: 'Chat service is available',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/voice/start
   */
  private async startCall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const { courseId, context, language = 'ar' } = req.body;

      const callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isArabic = language === 'ar';
      let greeting: string;

      if (context) {
        const greetingPrompt = isArabic
          ? `أنت عميل سعودي مهتم بالعقارات. ابدأ محادثة مع وكيل عقاري. قل جملة افتتاحية قصيرة وطبيعية باللهجة السعودية. السياق: ${context.substring(0, 500)}`
          : `You are a potential real estate client. Start a conversation with a real estate agent. Say a short, natural opening line. Context: ${context.substring(0, 500)}`;

        try {
          greeting = await this.llmProvider.complete({
            prompt: greetingPrompt,
            maxTokens: 150,
            temperature: 0.7,
          });
        } catch (llmError) {
          console.error('[VoiceController] LLM greeting error:', llmError);
          greeting = isArabic
            ? 'السلام عليكم، أنا أبحث عن عقار مناسب. هل يمكنكم مساعدتي؟'
            : 'Hello, I\'m looking for a property. Can you help me?';
        }
      } else {
        greeting = isArabic
          ? 'السلام عليكم، أنا أبحث عن عقار مناسب. هل يمكنكم مساعدتي؟'
          : 'Hello, I\'m looking for a property. Can you help me?';
      }

      const session: CallSession = {
        callId,
        traineeId,
        courseId,
        context,
        language,
        messages: [{ role: 'assistant', content: greeting, timestamp: new Date().toISOString() }],
        startTime: new Date(),
        status: 'active',
      };

      sessions.set(callId, session);
      console.log(`[VoiceController] Started call ${callId} for trainee ${traineeId}`);

      res.status(200).json({
        callId,
        greeting,
        greetingAudioBase64: null,
        audioContentType: null,
      });
    } catch (error) {
      console.error('[VoiceController] startCall error:', error);
      next(error);
    }
  }

  /**
   * POST /api/voice/:callId/message
   */
  private async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { callId } = req.params;
      const { message, language } = req.body;

      const session = sessions.get(callId);
      if (!session) {
        res.status(404).json({ error: 'Call session not found' });
        return;
      }

      if (session.status !== 'active') {
        res.status(400).json({ error: 'Call has ended' });
        return;
      }

      session.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });

      const isArabic = (language || session.language) === 'ar';
      const systemPrompt = isArabic
        ? `أنت عميل سعودي مهتم بشراء أو استئجار عقار. تتحدث مع وكيل عقاري.

شخصيتك:
- رجل أعمال سعودي في الأربعينات يتحدث اللهجة السعودية
- تبحث عن عقار استثماري
- ميزانيتك معقولة لكنك تفاوض
- تسأل أسئلة واقعية عن الموقع والسعر والخدمات

قواعد:
- تحدث باللهجة السعودية الطبيعية فقط
- ردودك قصيرة (جملة أو جملتين)
- اطرح اعتراضات واقعية أحياناً
- لا تكن سهل الإقناع جداً

${session.context ? `السياق: ${session.context.substring(0, 500)}` : ''}`
        : `You are a potential real estate client having a conversation with a real estate agent.

Your personality:
- Business professional in your 40s
- Looking for an investment property
- Have a reasonable budget but negotiate
- Ask realistic questions about location, price, and amenities

Rules:
- Keep responses short (1-2 sentences)
- Sometimes raise realistic objections
- Don't be too easy to convince

${session.context ? `Context: ${session.context.substring(0, 500)}` : ''}`;

      const conversationForLLM = session.messages
        .map(m => `${m.role === 'user' ? 'Agent' : 'Client'}: ${m.content}`)
        .join('\n');

      const prompt = `${conversationForLLM}\n\nClient:`;

      let aiResponse: string;
      try {
        aiResponse = await this.llmProvider.complete({
          prompt,
          systemPrompt,
          maxTokens: 200,
          temperature: 0.7,
        });

        aiResponse = aiResponse.trim();
        if (aiResponse.toLowerCase().startsWith('client:')) {
          aiResponse = aiResponse.substring(7).trim();
        }
      } catch (llmError) {
        console.error('[VoiceController] LLM response error:', llmError);
        aiResponse = isArabic
          ? 'حسناً، هذا مثير للاهتمام. أخبرني المزيد.'
          : 'Okay, that\'s interesting. Tell me more.';
      }

      session.messages.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
      });

      console.log(`[VoiceController] Message exchange in call ${callId}`);

      res.status(200).json({
        callId,
        aiResponse,
        audioBase64: null,
        audioContentType: null,
        sentiment: 'neutral',
        isComplete: false,
        conversationHistory: session.messages,
      });
    } catch (error) {
      console.error('[VoiceController] sendMessage error:', error);
      next(error);
    }
  }

  /**
   * POST /api/voice/:callId/end
   * End a call, analyze performance, and SAVE TO DATABASE
   */
  private async endCall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { callId } = req.params;
      const { endReason = 'completed' } = req.body;

      const session = sessions.get(callId);
      if (!session) {
        res.status(404).json({ error: 'Call session not found' });
        return;
      }

      session.status = 'ended';
      const endTime = new Date();
      const durationSeconds = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
      const totalMessages = session.messages.length;

      const isArabic = session.language === 'ar';
      let summary: string;
      let feedback: string;
      let overallScore = 70;
      let analysisData: Record<string, unknown> = {};

      // Generate detailed analysis with scores
      try {
        const conversationText = session.messages
          .map(m => `${m.role === 'user' ? 'الوكيل' : 'العميل'}: ${m.content}`)
          .join('\n');

        const analysisPrompt = isArabic
          ? `أنت خبير في تقييم أداء مبيعات العقارات. حلل المحادثة التالية بين وكيل عقاري (الوكيل) وعميل (العميل).

المحادثة:
${conversationText}

قيّم الأداء وأعطني:
1. النتيجة الإجمالية (0-100)
2. ملخص قصير للمحادثة
3. ملاحظات وتوصيات للتحسين
4. نقاط القوة
5. نقاط الضعف

أجب بصيغة JSON فقط:
{
  "overall_score": <0-100>,
  "summary": "<ملخص قصير>",
  "feedback": "<ملاحظات وتوصيات>",
  "strengths": ["<نقطة قوة 1>", "<نقطة قوة 2>"],
  "weaknesses": ["<نقطة ضعف 1>", "<نقطة ضعف 2>"],
  "breakdown": {
    "opening": <0-100>,
    "needs_discovery": <0-100>,
    "objection_handling": <0-100>,
    "persuasion": <0-100>,
    "closing": <0-100>,
    "communication": <0-100>
  }
}`
          : `You are an expert at evaluating real estate sales performance. Analyze the conversation between an agent and client.

Conversation:
${conversationText}

Respond in JSON only:
{
  "overall_score": <0-100>,
  "summary": "<brief summary>",
  "feedback": "<feedback and recommendations>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "breakdown": {
    "opening": <0-100>,
    "needs_discovery": <0-100>,
    "objection_handling": <0-100>,
    "persuasion": <0-100>,
    "closing": <0-100>,
    "communication": <0-100>
  }
}`;

        const analysisResult = await this.llmProvider.complete({
          prompt: analysisPrompt,
          maxTokens: 800,
          temperature: 0.3,
        });

        // Parse JSON response
        let jsonStr = analysisResult;
        const jsonMatch = analysisResult.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
        // Also try to find JSON object directly
        const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonStr = jsonObjMatch[0];
        }

        const analysis = JSON.parse(jsonStr.trim());
        overallScore = analysis.overall_score || 70;
        summary = analysis.summary || (isArabic ? 'تم إنهاء المحادثة' : 'Conversation ended');
        feedback = analysis.feedback || (isArabic ? 'أداء جيد بشكل عام' : 'Good overall performance');
        analysisData = analysis;

      } catch (llmError) {
        console.error('[VoiceController] Analysis error:', llmError);
        summary = isArabic ? 'تم إنهاء المحادثة' : 'Conversation ended';
        feedback = isArabic ? 'أداء جيد بشكل عام' : 'Good overall performance';
        analysisData = {
          overall_score: overallScore,
          summary,
          feedback,
          strengths: [isArabic ? 'إتمام المحادثة' : 'Completed the conversation'],
          weaknesses: [],
          breakdown: {
            opening: 70,
            needs_discovery: 70,
            objection_handling: 70,
            persuasion: 70,
            closing: 70,
            communication: 70,
          }
        };
      }

      // ========== SAVE TO DATABASE ==========
      let savedSessionId: string | null = null;
      try {
        // Create SimulationSession
        const simulationSession = await this.prisma.simulationSession.create({
          data: {
            traineeId: session.traineeId,
            scenarioType: session.courseId ? `course_practice` : 'text_practice',
            difficultyLevel: 'medium',
            status: 'completed',
            clientPersona: JSON.stringify({
              type: 'ai_text_client',
              language: session.language,
              courseId: session.courseId || null,
            }),
            startedAt: session.startTime,
            completedAt: endTime,
            durationSeconds,
            metrics: JSON.stringify({
              turnCount: totalMessages,
              aiEvaluatedScore: overallScore,
              aiGrade: overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F',
              breakdown: analysisData.breakdown || {},
              strengths: analysisData.strengths || [],
              weaknesses: analysisData.weaknesses || [],
            }),
            outcome: endReason,
          },
        });

        savedSessionId = simulationSession.id;

        // Save conversation turns
        for (let i = 0; i < session.messages.length; i++) {
          const msg = session.messages[i];
          await this.prisma.conversationTurn.create({
            data: {
              sessionId: simulationSession.id,
              speaker: msg.role === 'user' ? 'trainee' : 'client',
              message: msg.content,
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              turnNumber: i + 1,
            },
          });
        }

        // Create InteractionReport for reports page
        await this.prisma.interactionReport.create({
          data: {
            traineeId: session.traineeId,
            reportType: 'session',
            sourceType: 'ai_assessment',
            sourceId: simulationSession.id,
            summary: JSON.stringify({
              overallScore,
              totalMessages,
              durationSeconds,
              summary,
              courseId: session.courseId,
            }),
            strengths: JSON.stringify(analysisData.strengths || []),
            weaknesses: JSON.stringify(analysisData.weaknesses || []),
            recommendations: JSON.stringify([feedback]),
          },
        });

        console.log(`[VoiceController] ✅ Saved session ${simulationSession.id} to database with score ${overallScore}`);
      } catch (dbError) {
        console.error('[VoiceController] ❌ Database save error:', dbError);
        // Continue - still return the analysis to the user
      }

      console.log(`[VoiceController] Ended call ${callId} - ${totalMessages} messages, ${durationSeconds}s, score: ${overallScore}`);

      // Clean up from memory
      setTimeout(() => sessions.delete(callId), 60000);

      res.status(200).json({
        callId,
        sessionId: savedSessionId,
        summary,
        totalMessages,
        durationSeconds,
        feedback,
        overallScore,
      });
    } catch (error) {
      console.error('[VoiceController] endCall error:', error);
      next(error);
    }
  }

  /**
   * GET /api/voice/:callId/state
   */
  private async getCallState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { callId } = req.params;

      const session = sessions.get(callId);
      if (!session) {
        res.status(404).json({ error: 'Call session not found' });
        return;
      }

      res.status(200).json({
        callId,
        messages: session.messages,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/voice/tts
   */
  private async textToSpeech(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({
        audioBase64: null,
        contentType: null,
      });
    } catch (error) {
      next(error);
    }
  }
}
