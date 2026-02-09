/**
 * AV Content Generation Service
 *
 * Generates Audio-Visual educational content (video lectures, audio summaries)
 * using Gemini for structured content generation and ElevenLabs for Arabic TTS.
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import {
  IAVContentService,
  GenerateLectureParams,
  GenerateSummaryParams,
  SubmitFeedbackParams,
  ListOptions,
  AVContentResult,
  AVContentWithSlides,
  AVSlideResult,
  AVContentMetadata,
  GeminiLectureResponse,
  GeminiSlideContent,
  PaginatedResult,
  TraineeProfile,
} from '../interfaces/av-content.interface';

// Constants
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// ElevenLabs voice IDs for Arabic/English
const VOICE_IDS = {
  ar: 'onwK4e9ZLuTAKqWW03F9', // Daniel - Professional multilingual voice
  en: 'EXAVITQu4vr4xnSDxMaL', // Bella - English female
};

// System instructions for Gemini to generate structured lecture content
const LECTURE_SYSTEM_INSTRUCTION = `أنت خبير عقاري سعودي متخصص في التدريب المهني للوكلاء العقاريين.
You are a Saudi Real Estate Expert creating educational video lectures.

CRITICAL: Your response MUST be valid JSON matching this exact structure:
{
  "title": "string (Arabic)",
  "titleAr": "string (Arabic)",
  "description": "string (Arabic description)",
  "descriptionAr": "string (Arabic)",
  "slides": [
    {
      "slideNumber": 1,
      "title": "string",
      "titleAr": "string (Arabic)",
      "bulletPoints": ["point 1", "point 2", "point 3"],
      "bulletPointsAr": ["نقطة 1", "نقطة 2", "نقطة 3"],
      "visualType": "bullets",
      "narrationText": "English narration script for this slide",
      "narrationTextAr": "نص السرد العربي لهذه الشريحة - يجب أن يكون طبيعياً ومهنياً",
      "duration": 60
    }
  ],
  "totalDuration": 300
}

Guidelines for creating lectures:
1. Use formal Arabic (فصحى) for professional content
2. Include Saudi-specific regulations (نظام الوساطة العقارية، هيئة العقار)
3. Reference local market practices and terminology
4. Each slide should have 2-4 bullet points maximum
5. Narration should be conversational but professional
6. Estimate duration at ~150 words per minute for Arabic
7. Total lecture should be 5-15 minutes based on request
8. visualType can be: "bullets", "diagram", "chart"
9. For diagrams, add visualData with structure
10. Make content practical and actionable

IMPORTANT: Only output the JSON object, no markdown code blocks or explanations.`;

const SUMMARY_SYSTEM_INSTRUCTION = `أنت خبير عقاري سعودي تنشئ ملخصات صوتية تفاعلية للمتدربين.
You are creating interactive audio summaries for Saudi real estate trainees.

Based on the trainee's weak areas and the topic provided, create a focused audio summary.

CRITICAL: Your response MUST be valid JSON matching this structure:
{
  "title": "string",
  "titleAr": "string (Arabic)",
  "description": "string",
  "descriptionAr": "string (Arabic)",
  "slides": [
    {
      "slideNumber": 1,
      "title": "Key Point Title",
      "titleAr": "عنوان النقطة الرئيسية",
      "bulletPoints": ["point 1", "point 2"],
      "bulletPointsAr": ["نقطة 1", "نقطة 2"],
      "visualType": "bullets",
      "narrationText": "Detailed explanation...",
      "narrationTextAr": "شرح تفصيلي...",
      "duration": 45
    }
  ],
  "totalDuration": 180
}

Guidelines:
1. Focus on the trainee's weak areas provided
2. Keep summaries concise (3-5 minutes total)
3. Include quick review questions in narration
4. Emphasize key takeaways and practical tips
5. Use encouraging, motivational tone

IMPORTANT: Only output the JSON object, no markdown code blocks.`;

@injectable()
export class AVContentService implements IAVContentService {
  private elevenLabsApiKey: string;
  private geminiApiKey: string;

  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.geminiApiKey = process.env.GEMINI_API_KEY || '';
  }

  // ============================================================================
  // LECTURE GENERATION
  // ============================================================================

  async generateLecture(params: GenerateLectureParams): Promise<AVContentResult> {
    const { traineeId, topic, lessonContext, courseId, duration = 10, language } = params;

    // Get trainee profile for personalization
    const traineeProfile = await this.getTraineeProfile(traineeId);

    // Create initial AV content record
    const content = await this.prisma.aVContent.create({
      data: {
        traineeId,
        type: 'lecture',
        title: `محاضرة: ${topic}`,
        titleAr: `محاضرة: ${topic}`,
        topic,
        sourceContext: lessonContext || courseId,
        totalDuration: duration * 60, // Convert to seconds
        status: 'generating',
        metadata: JSON.stringify({
          language,
          voiceId: VOICE_IDS[language === 'bilingual' ? 'ar' : language],
          adaptations: traineeProfile.weaknesses,
        }),
      },
    });

    try {
      // Generate lecture structure using Gemini
      const lectureStructure = await this.generateLectureStructure(
        topic,
        duration,
        language,
        traineeProfile,
        lessonContext
      );

      // Create slides in database
      const slides = await this.createSlides(content.id, lectureStructure.slides);

      // Generate audio for all slides
      const audioUrl = await this.generateLectureAudio(
        lectureStructure.slides,
        language
      );

      // Update content with audio URL and ready status
      const updatedContent = await this.prisma.aVContent.update({
        where: { id: content.id },
        data: {
          title: lectureStructure.title,
          titleAr: lectureStructure.titleAr,
          description: lectureStructure.description,
          descriptionAr: lectureStructure.descriptionAr,
          totalDuration: lectureStructure.totalDuration,
          audioUrl,
          status: 'ready',
        },
      });

      return this.mapToAVContentResult(updatedContent);
    } catch (error) {
      // Update status to failed
      await this.prisma.aVContent.update({
        where: { id: content.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  private async generateLectureStructure(
    topic: string,
    durationMinutes: number,
    language: 'ar' | 'en' | 'bilingual',
    profile: TraineeProfile,
    lessonContext?: string
  ): Promise<GeminiLectureResponse> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const weakAreasContext = profile.weaknesses.length > 0
      ? `\n\nTrainee weak areas to address: ${profile.weaknesses.join(', ')}`
      : '';

    const lessonContextText = lessonContext
      ? `\n\nLesson context: ${lessonContext}`
      : '';

    const prompt = `Create a ${durationMinutes}-minute educational video lecture about "${topic}" for Saudi real estate agents.

Language preference: ${language === 'ar' ? 'Arabic (فصحى)' : language === 'en' ? 'English' : 'Bilingual (Arabic primary)'}
${weakAreasContext}
${lessonContextText}

The lecture should have 5-8 slides covering:
1. Introduction and overview
2. Key concepts and definitions
3. Practical applications
4. Saudi market specifics
5. Common mistakes to avoid
6. Summary and action items

Remember to output ONLY valid JSON, no markdown.`;

    const response = await fetch(
      `${GEMINI_API_BASE}/models/gemini-2.0-flash-001:generateContent?key=${this.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: LECTURE_SYSTEM_INSTRUCTION + '\n\n' + prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON response
    try {
      // Clean up response - remove markdown code blocks if present
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
      }
      return JSON.parse(jsonStr) as GeminiLectureResponse;
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      throw new Error('Failed to parse lecture structure from AI response');
    }
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  async generateSummary(params: GenerateSummaryParams): Promise<AVContentResult> {
    const { traineeId, topic, sourceText, focusAreas, language } = params;

    console.log('[AVContentService] Starting summary generation:', { traineeId, topic, language });

    // Get trainee profile
    const traineeProfile = await this.getTraineeProfile(traineeId);
    console.log('[AVContentService] Got trainee profile:', { weaknesses: traineeProfile.weaknesses });

    // Combine focus areas with trainee weaknesses
    const allFocusAreas = [
      ...(focusAreas || []),
      ...traineeProfile.weaknesses,
    ].filter((v, i, a) => a.indexOf(v) === i); // Unique

    // Create initial record
    const content = await this.prisma.aVContent.create({
      data: {
        traineeId,
        type: 'summary',
        title: `ملخص: ${topic}`,
        titleAr: `ملخص: ${topic}`,
        topic,
        sourceContext: sourceText?.slice(0, 1000),
        totalDuration: 180, // Default 3 minutes
        status: 'generating',
        metadata: JSON.stringify({
          language,
          voiceId: VOICE_IDS[language === 'bilingual' ? 'ar' : language],
          adaptations: allFocusAreas,
        }),
      },
    });

    try {
      // Generate summary structure
      console.log('[AVContentService] Calling Gemini to generate summary structure...');
      const summaryStructure = await this.generateSummaryStructure(
        topic,
        allFocusAreas,
        language,
        sourceText
      );
      console.log('[AVContentService] Gemini response received:', {
        title: summaryStructure.title,
        slidesCount: summaryStructure.slides?.length || 0,
        totalDuration: summaryStructure.totalDuration,
      });

      // Create slides
      console.log('[AVContentService] Creating slides in database...');
      await this.createSlides(content.id, summaryStructure.slides);
      console.log('[AVContentService] Slides created successfully');

      // Generate audio
      console.log('[AVContentService] Generating audio with ElevenLabs...');
      const audioUrl = await this.generateLectureAudio(
        summaryStructure.slides,
        language
      );
      console.log('[AVContentService] Audio generated:', { hasAudio: !!audioUrl, audioLength: audioUrl?.length || 0 });

      // Update content
      const updatedContent = await this.prisma.aVContent.update({
        where: { id: content.id },
        data: {
          title: summaryStructure.title,
          titleAr: summaryStructure.titleAr,
          description: summaryStructure.description,
          descriptionAr: summaryStructure.descriptionAr,
          totalDuration: summaryStructure.totalDuration,
          audioUrl,
          status: 'ready',
        },
      });

      console.log('[AVContentService] Summary generation complete:', { contentId: content.id, status: 'ready' });
      return this.mapToAVContentResult(updatedContent);
    } catch (error) {
      console.error('[AVContentService] Summary generation failed:', error);
      await this.prisma.aVContent.update({
        where: { id: content.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  private async generateSummaryStructure(
    topic: string,
    focusAreas: string[],
    language: 'ar' | 'en' | 'bilingual',
    sourceText?: string
  ): Promise<GeminiLectureResponse> {
    console.log('[AVContentService] generateSummaryStructure called:', { topic, focusAreas, language });

    if (!this.geminiApiKey) {
      console.error('[AVContentService] GEMINI_API_KEY is not configured!');
      throw new Error('Gemini API key not configured');
    }
    console.log('[AVContentService] Gemini API key found (length:', this.geminiApiKey.length, ')');

    const focusAreasText = focusAreas.length > 0
      ? `Focus on these weak areas: ${focusAreas.join(', ')}`
      : '';

    const sourceTextContext = sourceText
      ? `\n\nSource material to summarize:\n${sourceText.slice(0, 2000)}`
      : '';

    const prompt = `Create a 3-5 minute audio summary about "${topic}" for Saudi real estate trainees.

${focusAreasText}
${sourceTextContext}

Language: ${language === 'ar' ? 'Arabic' : language === 'en' ? 'English' : 'Bilingual'}

Create 3-5 slides that:
1. Highlight key takeaways
2. Address the weak areas mentioned
3. Include quick self-assessment questions
4. Provide actionable tips

Output ONLY valid JSON, no markdown.`;

    console.log('[AVContentService] Calling Gemini API...');
    const response = await fetch(
      `${GEMINI_API_BASE}/models/gemini-2.0-flash-001:generateContent?key=${this.geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: SUMMARY_SYSTEM_INSTRUCTION + '\n\n' + prompt }]
          }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 2500,
          },
        }),
      }
    );

    console.log('[AVContentService] Gemini response status:', response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AVContentService] Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      let jsonStr = text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```(?:json)?\s*/g, '').replace(/```\s*$/g, '');
      }
      return JSON.parse(jsonStr) as GeminiLectureResponse;
    } catch {
      throw new Error('Failed to parse summary structure from AI response');
    }
  }

  // ============================================================================
  // AUDIO GENERATION
  // ============================================================================

  private async generateLectureAudio(
    slides: GeminiSlideContent[],
    language: 'ar' | 'en' | 'bilingual'
  ): Promise<string> {
    if (!this.elevenLabsApiKey) {
      // Return empty string if no API key - audio will be generated client-side or skipped
      return '';
    }

    // Combine all narration texts
    const narrationTexts = slides.map(slide =>
      language === 'en'
        ? slide.narrationText
        : (slide.narrationTextAr || slide.narrationText)
    );

    const fullNarration = narrationTexts.join('\n\n');

    // Generate audio using ElevenLabs
    const voiceId = VOICE_IDS[language === 'bilingual' ? 'ar' : language];
    const modelId = language === 'ar' || language === 'bilingual'
      ? 'eleven_multilingual_v2'
      : 'eleven_turbo_v2_5';

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: fullNarration,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('ElevenLabs TTS error:', error);
      return ''; // Return empty - frontend can handle missing audio
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

    // Return as data URL for direct playback
    return `data:audio/mpeg;base64,${audioBase64}`;
  }

  // ============================================================================
  // DATABASE HELPERS
  // ============================================================================

  private async createSlides(
    contentId: string,
    slides: GeminiSlideContent[]
  ): Promise<AVSlideResult[]> {
    // Calculate audio timings based on duration estimates
    let currentTime = 0;

    const slideData = slides.map((slide, index) => {
      const startTime = currentTime;
      const endTime = currentTime + slide.duration;
      currentTime = endTime;

      return {
        contentId,
        slideNumber: slide.slideNumber || index + 1,
        title: slide.title,
        titleAr: slide.titleAr,
        bulletPoints: JSON.stringify(slide.bulletPoints),
        bulletPointsAr: slide.bulletPointsAr ? JSON.stringify(slide.bulletPointsAr) : null,
        visualType: slide.visualType || 'bullets',
        visualData: slide.visualData ? JSON.stringify(slide.visualData) : null,
        narrationText: slide.narrationText,
        narrationTextAr: slide.narrationTextAr,
        audioStartTime: startTime,
        audioEndTime: endTime,
        duration: slide.duration,
      };
    });

    // Batch create slides
    await this.prisma.aVSlide.createMany({ data: slideData });

    // Fetch created slides
    const createdSlides = await this.prisma.aVSlide.findMany({
      where: { contentId },
      orderBy: { slideNumber: 'asc' },
    });

    return createdSlides.map(this.mapToAVSlideResult);
  }

  private async getTraineeProfile(traineeId: string): Promise<TraineeProfile> {
    const trainee = await this.prisma.trainee.findUnique({
      where: { id: traineeId },
      include: {
        interactionReports: {
          orderBy: { generatedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!trainee) {
      throw new Error('Trainee not found');
    }

    // Extract weaknesses and knowledge gaps from recent reports
    const weaknesses: string[] = [];
    const knowledgeGaps: string[] = [];
    const improvementAreas: string[] = [];

    for (const report of trainee.interactionReports) {
      try {
        const w = JSON.parse(report.weaknesses as string);
        const kg = JSON.parse(report.knowledgeGaps as string);
        const r = JSON.parse(report.recommendations as string);
        weaknesses.push(...(Array.isArray(w) ? w : []));
        knowledgeGaps.push(...(Array.isArray(kg) ? kg : []));
        improvementAreas.push(...(Array.isArray(r) ? r : []));
      } catch {
        // Skip malformed JSON
      }
    }

    return {
      id: trainee.id,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
      weaknesses: [...new Set(weaknesses)].slice(0, 5),
      knowledgeGaps: [...new Set(knowledgeGaps)].slice(0, 5),
      improvementAreas: [...new Set(improvementAreas)].slice(0, 5),
      completedTopics: [],
    };
  }

  // ============================================================================
  // CONTENT RETRIEVAL
  // ============================================================================

  async getContent(contentId: string, traineeId: string): Promise<AVContentWithSlides> {
    const content = await this.prisma.aVContent.findFirst({
      where: {
        id: contentId,
        traineeId, // Ensure trainee owns this content
      },
      include: {
        slides: {
          orderBy: { slideNumber: 'asc' },
        },
      },
    });

    if (!content) {
      throw new Error('Content not found');
    }

    return {
      ...this.mapToAVContentResult(content),
      slides: content.slides.map(this.mapToAVSlideResult),
    };
  }

  async listContent(
    traineeId: string,
    options: ListOptions
  ): Promise<PaginatedResult<AVContentResult>> {
    const { page = 1, limit = 10, type } = options;
    const skip = (page - 1) * limit;

    const where = {
      traineeId,
      ...(type ? { type } : {}),
    };

    const [contents, total] = await Promise.all([
      this.prisma.aVContent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.aVContent.count({ where }),
    ]);

    return {
      data: contents.map(this.mapToAVContentResult),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================================================
  // FEEDBACK
  // ============================================================================

  async submitFeedback(params: SubmitFeedbackParams): Promise<void> {
    const { contentId, traineeId, rating, helpful, comment, watchDuration, completedSlides } = params;

    // Verify content belongs to trainee
    const content = await this.prisma.aVContent.findFirst({
      where: { id: contentId, traineeId },
    });

    if (!content) {
      throw new Error('Content not found');
    }

    await this.prisma.aVFeedback.create({
      data: {
        contentId,
        traineeId,
        rating,
        helpful,
        comment,
        watchDuration,
        completedSlides: completedSlides || [],
      },
    });
  }

  // ============================================================================
  // DELETE
  // ============================================================================

  async deleteContent(contentId: string, traineeId: string): Promise<void> {
    // Verify ownership
    const content = await this.prisma.aVContent.findFirst({
      where: { id: contentId, traineeId },
    });

    if (!content) {
      throw new Error('Content not found');
    }

    // Delete cascades to slides and feedback
    await this.prisma.aVContent.delete({
      where: { id: contentId },
    });
  }

  // ============================================================================
  // MAPPERS
  // ============================================================================

  private mapToAVContentResult(content: any): AVContentResult {
    return {
      id: content.id,
      traineeId: content.traineeId,
      type: content.type as 'lecture' | 'summary',
      title: content.title,
      titleAr: content.titleAr,
      description: content.description,
      descriptionAr: content.descriptionAr,
      topic: content.topic,
      sourceContext: content.sourceContext,
      totalDuration: content.totalDuration,
      status: content.status as 'generating' | 'ready' | 'failed',
      audioUrl: content.audioUrl,
      metadata: JSON.parse(content.metadata || '{}'),
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
    };
  }

  private mapToAVSlideResult(slide: any): AVSlideResult {
    return {
      id: slide.id,
      slideNumber: slide.slideNumber,
      title: slide.title,
      titleAr: slide.titleAr,
      bulletPoints: JSON.parse(slide.bulletPoints || '[]'),
      bulletPointsAr: slide.bulletPointsAr ? JSON.parse(slide.bulletPointsAr) : undefined,
      visualType: slide.visualType as 'bullets' | 'diagram' | 'chart' | 'image',
      visualData: slide.visualData ? JSON.parse(slide.visualData) : undefined,
      narrationText: slide.narrationText,
      narrationTextAr: slide.narrationTextAr,
      audioStartTime: slide.audioStartTime,
      audioEndTime: slide.audioEndTime,
      duration: slide.duration,
    };
  }
}
