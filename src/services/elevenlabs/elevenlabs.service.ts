/**
 * ElevenLabs Conversational AI Service
 *
 * Production-grade service for managing ElevenLabs voice agents,
 * conversation sessions, and AI-powered performance analysis.
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import {
  IElevenLabsService,
  ConversationDetails,
  PerformanceAnalysis,
  ConversationSummary,
  TranscriptMessage,
} from '../interfaces/elevenlabs.interface';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';

// ============================================================================
// CONSTANTS
// ============================================================================

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// Saudi real estate client agent configuration
const SAUDI_CLIENT_AGENT_CONFIG = {
  name: 'Saudi Real Estate Client - Training',
  firstMessage: 'السلام عليكم، أنا أبو محمد. شفت إعلانكم عن العقارات وحبيت أستفسر. عندكم شي مناسب للاستثمار؟',
  systemPrompt: `أنت عميل سعودي (المشتري) تتصل بوكيل عقاري للاستفسار عن عقار للتدريب على المبيعات.

شخصيتك:
- اسمك أبو محمد، رجل أعمال سعودي في الأربعينات
- تبحث عن عقار استثماري في الرياض أو جدة
- ميزانيتك بين 2-5 مليون ريال
- مهتم بالعائد الاستثماري والموقع

قواعد صارمة:
1. تحدث فقط باللهجة السعودية - لا تستخدم الفصحى أو الإنجليزية
2. أنت العميل المشتري - لا تقل أبداً "كيف أقدر أساعدك"
3. ردودك قصيرة وطبيعية - جملة أو جملتين
4. اسأل عن: السعر، الموقع، المساحة، العائد، الجيران، الخدمات
5. كن مهتم لكن حذر - لا توافق بسرعة
6. إذا أعجبك العرض، أظهر اهتمام تدريجي
7. إذا كان السعر عالي، فاوض واطلب تخفيض

أمثلة على ردودك:
- "طيب، كم السعر النهائي؟"
- "والموقع وين بالضبط؟ قريب من الخدمات؟"
- "الصراحة السعر شوي مرتفع، فيه مجال للتفاوض؟"
- "كم العائد المتوقع لو أجرته؟"
- "خلني أفكر وأرد عليك"`,
  voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Arabic male voice - Khalid
  language: 'ar',
};

@injectable()
export class ElevenLabsService implements IElevenLabsService {
  private apiKey: string;
  private agentId: string | null = null;

  constructor(
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[ElevenLabsService] No API key configured');
    }
  }

  // ============================================================================
  // AGENT MANAGEMENT
  // ============================================================================

  /**
   * Get or create the Saudi real estate client agent
   */
  async getAgentId(): Promise<string> {
    // Return cached agent ID if available
    if (this.agentId) {
      return this.agentId;
    }

    // Check environment variable first
    if (process.env.ELEVENLABS_AGENT_ID) {
      this.agentId = process.env.ELEVENLABS_AGENT_ID;
      console.log(`[ElevenLabsService] Using configured agent ID: ${this.agentId}`);
      return this.agentId;
    }

    // Try to find existing agent by name
    try {
      const existingAgent = await this.findAgentByName(SAUDI_CLIENT_AGENT_CONFIG.name);
      if (existingAgent) {
        this.agentId = existingAgent;
        console.log(`[ElevenLabsService] Found existing agent: ${this.agentId}`);
        return this.agentId;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('[ElevenLabsService] Could not find existing agent:', errorMessage);
      // If we can't list agents, the API key doesn't have ConvAI permissions
      if (errorMessage.includes('401') || errorMessage.includes('permission')) {
        throw new Error(
          'ElevenLabs API key does not have Conversational AI permissions. ' +
          'Please create an agent manually at https://elevenlabs.io/app/conversational-ai ' +
          'and add ELEVENLABS_AGENT_ID to your .env file.'
        );
      }
    }

    // Create new agent
    try {
      this.agentId = await this.createAgent();
      console.log(`[ElevenLabsService] Created new agent: ${this.agentId}`);
      return this.agentId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('401') || errorMessage.includes('permission')) {
        throw new Error(
          'Failed to create agent - API key lacks Conversational AI permissions. ' +
          'Please create an agent manually at https://elevenlabs.io/app/conversational-ai ' +
          'and add ELEVENLABS_AGENT_ID to your .env file.'
        );
      }
      throw error;
    }
  }

  /**
   * Find agent by name
   */
  private async findAgentByName(name: string): Promise<string | null> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents`, {
      method: 'GET',
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${response.status}`);
    }

    const data = await response.json() as { agents?: Array<{ name: string; agent_id: string }> };
    const agent = data.agents?.find((a) => a.name === name);
    return agent?.agent_id || null;
  }

  /**
   * Create a new agent
   */
  private async createAgent(): Promise<string> {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: SAUDI_CLIENT_AGENT_CONFIG.name,
        conversation_config: {
          agent: {
            first_message: SAUDI_CLIENT_AGENT_CONFIG.firstMessage,
            prompt: {
              prompt: SAUDI_CLIENT_AGENT_CONFIG.systemPrompt,
            },
            language: SAUDI_CLIENT_AGENT_CONFIG.language,
          },
          tts: {
            voice_id: SAUDI_CLIENT_AGENT_CONFIG.voiceId,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create agent: ${response.status} - ${error}`);
    }

    const data = await response.json() as { agent_id: string };
    return data.agent_id;
  }

  // ============================================================================
  // CONVERSATION MANAGEMENT
  // ============================================================================

  /**
   * Get a signed URL for secure WebSocket connection
   */
  async getSignedUrl(agentId: string): Promise<string> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get signed URL: ${response.status} - ${error}`);
    }

    const data = await response.json() as { signed_url: string };
    return data.signed_url;
  }

  /**
   * Get conversation details including transcript
   */
  async getConversation(conversationId: string): Promise<ConversationDetails> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get conversation: ${response.status} - ${error}`);
    }

    interface ElevenLabsConversationResponse {
      conversation_id: string;
      agent_id: string;
      status: string;
      transcript?: Array<{ role: string; message: string; time_in_call_secs: number }>;
      metadata?: {
        start_time_unix_secs?: number;
        call_duration_secs?: number;
        cost?: number;
      };
      has_audio?: boolean;
    }

    const data = await response.json() as ElevenLabsConversationResponse;

    // Transform transcript to our format
    const transcript: TranscriptMessage[] = (data.transcript || []).map(
      (item) => ({
        role: item.role as 'user' | 'agent',
        message: item.message || '',
        timeInCallSecs: item.time_in_call_secs || 0,
      })
    );

    return {
      conversationId: data.conversation_id,
      agentId: data.agent_id,
      status: data.status as 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed',
      transcript,
      metadata: {
        startTime: data.metadata?.start_time_unix_secs || 0,
        duration: data.metadata?.call_duration_secs || 0,
        cost: data.metadata?.cost,
      },
      hasAudio: data.has_audio || false,
    };
  }

  /**
   * Get conversation audio recording
   */
  async getConversationAudio(conversationId: string): Promise<Buffer> {
    const response = await fetch(
      `${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}/audio`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get audio: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ============================================================================
  // PERFORMANCE ANALYSIS
  // ============================================================================

  /**
   * Wait for conversation to be fully processed by ElevenLabs
   * Returns the conversation once status is 'done' and transcript is available
   */
  private async waitForConversationReady(conversationId: string, maxWaitMs: number = 30000): Promise<ConversationDetails> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const conversation = await this.getConversation(conversationId);

      console.log(`[ElevenLabsService] Conversation ${conversationId} status: ${conversation.status}, transcript length: ${conversation.transcript.length}`);

      // If status is 'done' and we have transcript, we're good
      if (conversation.status === 'done' && conversation.transcript.length > 0) {
        return conversation;
      }

      // If status is failed, throw error
      if (conversation.status === 'failed') {
        throw new Error('Conversation processing failed on ElevenLabs side');
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Final attempt after max wait
    const finalConversation = await this.getConversation(conversationId);
    if (finalConversation.transcript.length > 0) {
      return finalConversation;
    }

    throw new Error(`Conversation transcript not available after ${maxWaitMs/1000}s. Status: ${finalConversation.status}`);
  }

  /**
   * Analyze trainee performance from conversation
   */
  async analyzePerformance(conversationId: string): Promise<PerformanceAnalysis> {
    // Wait for conversation to be fully processed
    console.log(`[ElevenLabsService] Waiting for conversation ${conversationId} to be ready...`);
    const conversation = await this.waitForConversationReady(conversationId);
    console.log(`[ElevenLabsService] Conversation ready with ${conversation.transcript.length} messages`);

    // Build transcript text for analysis
    const transcriptText = conversation.transcript
      .map((msg) => `${msg.role === 'user' ? 'الوكيل' : 'العميل'}: ${msg.message}`)
      .join('\n');

    // Use LLM to analyze performance
    const analysisPrompt = `أنت خبير في تقييم أداء مبيعات العقارات. حلل المحادثة التالية بين وكيل عقاري (الوكيل) وعميل محتمل (العميل).

المحادثة:
${transcriptText}

قيّم أداء الوكيل العقاري في المجالات التالية (من 0 إلى 100):

1. الافتتاحية (opening): كيف بدأ المحادثة، الترحيب، بناء العلاقة
2. اكتشاف الاحتياجات (needs_discovery): هل سأل أسئلة لفهم ما يريده العميل
3. معالجة الاعتراضات (objection_handling): كيف تعامل مع مخاوف العميل
4. الإقناع (persuasion): قدرته على إبراز مزايا العقار
5. الإغلاق (closing): محاولة إتمام الصفقة أو تحديد الخطوة التالية
6. التواصل (communication): وضوح الكلام، الاستماع، اللباقة

أجب بصيغة JSON فقط بدون أي نص إضافي:
{
  "overall_score": <متوسط الدرجات>,
  "breakdown": {
    "opening": <0-100>,
    "needs_discovery": <0-100>,
    "objection_handling": <0-100>,
    "persuasion": <0-100>,
    "closing": <0-100>,
    "communication": <0-100>
  },
  "strengths": ["<نقطة قوة 1>", "<نقطة قوة 2>"],
  "weaknesses": ["<نقطة ضعف 1>", "<نقطة ضعف 2>"],
  "improvements": ["<اقتراح تحسين 1>", "<اقتراح تحسين 2>"],
  "summary": "<ملخص الأداء في جملتين>",
  "transcript_highlights": {
    "good": ["<عبارة جيدة قالها الوكيل>"],
    "needs_work": ["<عبارة تحتاج تحسين>"]
  }
}`;

    const result = await this.llmProvider.complete({
      prompt: analysisPrompt,
      maxTokens: 1500,
      temperature: 0.3,
    });

    // Parse JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const analysis = JSON.parse(jsonStr.trim());

      return {
        overallScore: analysis.overall_score || 0,
        breakdown: {
          opening: analysis.breakdown?.opening || 0,
          needsDiscovery: analysis.breakdown?.needs_discovery || 0,
          objectionHandling: analysis.breakdown?.objection_handling || 0,
          persuasion: analysis.breakdown?.persuasion || 0,
          closing: analysis.breakdown?.closing || 0,
          communication: analysis.breakdown?.communication || 0,
        },
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        improvements: analysis.improvements || [],
        summary: analysis.summary || '',
        transcriptHighlights: {
          good: analysis.transcript_highlights?.good || [],
          needsWork: analysis.transcript_highlights?.needs_work || [],
        },
      };
    } catch (parseError) {
      console.error('[ElevenLabsService] Failed to parse analysis:', parseError);
      // Return default analysis on parse error
      return {
        overallScore: 50,
        breakdown: {
          opening: 50,
          needsDiscovery: 50,
          objectionHandling: 50,
          persuasion: 50,
          closing: 50,
          communication: 50,
        },
        strengths: ['تم إجراء المحادثة'],
        weaknesses: ['تحليل غير متاح'],
        improvements: ['حاول مرة أخرى'],
        summary: 'لم يتم تحليل المحادثة بشكل كامل',
        transcriptHighlights: {
          good: [],
          needsWork: [],
        },
      };
    }
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  /**
   * Save conversation and analysis to database
   */
  async saveConversationRecord(
    traineeId: string,
    conversationId: string,
    analysis: PerformanceAnalysis
  ): Promise<string> {
    // Get conversation details
    const conversation = await this.getConversation(conversationId);

    // Try to get audio (may not be available immediately)
    let audioBase64: string | null = null;
    try {
      const audioBuffer = await this.getConversationAudio(conversationId);
      audioBase64 = audioBuffer.toString('base64');
    } catch (error) {
      console.log('[ElevenLabsService] Audio not available yet');
    }

    // Save to database
    const record = await this.prisma.voiceSession.create({
      data: {
        traineeId,
        conversationId,
        startTime: new Date(conversation.metadata.startTime * 1000),
        endTime: new Date((conversation.metadata.startTime + conversation.metadata.duration) * 1000),
        durationSeconds: conversation.metadata.duration,
        transcript: JSON.stringify(conversation.transcript),
        analysis: JSON.stringify(analysis),
        overallScore: analysis.overallScore,
        audioBase64,
        status: conversation.status,
      },
    });

    return record.id;
  }

  /**
   * Get trainee's conversation history with full details
   */
  async getTraineeConversations(traineeId: string): Promise<ConversationSummary[]> {
    const sessions = await this.prisma.voiceSession.findMany({
      where: { traineeId },
      orderBy: { startTime: 'desc' },
      take: 50,
    });

    return sessions.map((session) => ({
      id: session.id,
      conversationId: session.conversationId,
      traineeId: session.traineeId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.durationSeconds || 0,
      durationSeconds: session.durationSeconds || 0,
      overallScore: session.overallScore || 0,
      status: session.status,
      analysis: session.analysis,
      transcript: session.transcript,
      hasAudio: !!session.audioBase64,
    }));
  }

  /**
   * Get full session details by ID
   */
  async getSessionById(sessionId: string): Promise<{
    id: string;
    conversationId: string;
    traineeId: string;
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    overallScore: number;
    status: string;
    analysis: string | null;
    transcript: string;
    hasAudio: boolean;
  } | null> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    return {
      id: session.id,
      conversationId: session.conversationId,
      traineeId: session.traineeId,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSeconds: session.durationSeconds || 0,
      overallScore: session.overallScore || 0,
      status: session.status,
      analysis: session.analysis,
      transcript: session.transcript,
      hasAudio: !!session.audioBase64,
    };
  }

  /**
   * Get session audio by ID
   */
  async getSessionAudio(sessionId: string): Promise<Buffer | null> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      select: { audioBase64: true },
    });

    if (!session?.audioBase64) return null;

    return Buffer.from(session.audioBase64, 'base64');
  }

  /**
   * Retry fetching and saving audio for a session
   */
  async retryFetchAudio(sessionId: string): Promise<boolean> {
    const session = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.audioBase64) return false;

    try {
      const audioBuffer = await this.getConversationAudio(session.conversationId);
      const audioBase64 = audioBuffer.toString('base64');

      await this.prisma.voiceSession.update({
        where: { id: sessionId },
        data: { audioBase64 },
      });

      return true;
    } catch (error) {
      console.error('[ElevenLabsService] Failed to retry fetch audio:', error);
      return false;
    }
  }
}
