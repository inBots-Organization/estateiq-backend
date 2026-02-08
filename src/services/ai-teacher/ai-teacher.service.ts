/**
 * AI Teacher Service
 *
 * Provides a personalized AI mentor experience for trainees,
 * leveraging their historical performance data and maintaining
 * trainee profiles in markdown files.
 */

import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');
import {
  IAITeacherService,
  TraineeProfile,
  ChatMessage,
  ChatResponse,
  WelcomeResponse,
  TeacherSession,
  FileAttachment,
  LessonContext,
  StreamingChatResponse,
  SessionNote,
} from '../interfaces/ai-teacher.interface';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { FallbackLLMProvider } from '../../providers/llm/fallback.provider';

// Constants
const PROFILES_DIR = path.join(process.cwd(), 'data', 'trainee-profiles');
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ElevenLabs voice IDs - Using high-quality multilingual voices
const VOICE_IDS = {
  ar: 'onwK4e9ZLuTAKqWW03F9', // Daniel - Professional multilingual voice (excellent Arabic)
  en: 'EXAVITQu4vr4xnSDxMaL', // Bella - English female
};

@injectable()
export class AITeacherService implements IAITeacherService {
  private elevenLabsApiKey: string;
  private sessionCache: Map<string, TeacherSession> = new Map();
  private fallbackProvider: FallbackLLMProvider;

  constructor(
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {
    this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || '';
    this.fallbackProvider = new FallbackLLMProvider();
    this.ensureProfilesDir();
  }

  // ============================================================================
  // PROFILE MANAGEMENT
  // ============================================================================

  private async ensureProfilesDir(): Promise<void> {
    try {
      await fs.mkdir(PROFILES_DIR, { recursive: true });
    } catch {
      // Silently ignore if directory already exists
    }
  }

  private getProfilePath(traineeId: string): string {
    return path.join(PROFILES_DIR, `${traineeId}_profile.md`);
  }

  async getOrCreateProfile(traineeId: string): Promise<TraineeProfile> {
    const profilePath = this.getProfilePath(traineeId);

    try {
      // Try to read existing profile
      const content = await fs.readFile(profilePath, 'utf-8');
      return this.parseProfileMarkdown(content, traineeId);
    } catch {
      // Profile doesn't exist, create from database
      return this.createProfileFromDatabase(traineeId);
    }
  }

  async updateProfile(traineeId: string, updates: Partial<TraineeProfile>): Promise<TraineeProfile> {
    const profile = await this.getOrCreateProfile(traineeId);
    const updatedProfile = { ...profile, ...updates, updatedAt: new Date() };
    await this.saveProfile(updatedProfile);
    return updatedProfile;
  }

  async syncProfileWithPerformance(traineeId: string): Promise<TraineeProfile> {
    const profile = await this.getOrCreateProfile(traineeId);
    return this.syncProfileWithPerformanceInternal(profile);
  }

  private async createProfileFromDatabase(traineeId: string): Promise<TraineeProfile> {
    const trainee = await this.prisma.trainee.findUnique({
      where: { id: traineeId },
    });

    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const profile: TraineeProfile = {
      traineeId,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
      email: trainee.email,
      personalityTraits: [],
      preferredLearningStyle: 'mixed',
      communicationPreference: 'casual',
      language: 'ar',
      strengths: [],
      weaknesses: [],
      knowledgeGaps: [],
      likes: [],
      dislikes: [],
      totalSessions: 0,
      averageScore: 0,
      currentStreak: trainee.currentStreak,
      lastActiveAt: trainee.lastActiveAt,
      recentTopics: [],
      improvementAreas: [],
      sessionNotes: [], // AI Teacher session logs
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save the initial profile first to avoid recursive calls
    await this.saveProfile(profile);

    // Now sync with performance data (this will read the saved profile)
    return this.syncProfileWithPerformanceInternal(profile);
  }

  /**
   * Internal sync method that takes an existing profile to avoid recursive calls
   */
  private async syncProfileWithPerformanceInternal(profile: TraineeProfile): Promise<TraineeProfile> {
    const traineeId = profile.traineeId;

    // Fetch recent performance data
    const sessions = await this.prisma.simulationSession.findMany({
      where: { traineeId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });

    const voiceSessions = await this.prisma.voiceSession.findMany({
      where: { traineeId },
      orderBy: { endTime: 'desc' },
      take: 10,
    });

    // Fetch completed lectures for course progress tracking
    const completedLectures = await this.prisma.lectureCompletion.findMany({
      where: { traineeId },
      include: { lecture: { include: { course: true } } },
      orderBy: { completedAt: 'desc' },
      take: 20,
    });

    // Fetch completed assessments
    const completedAssessments = await this.prisma.assessmentCompletion.findMany({
      where: { traineeId },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });

    // Analyze performance
    const allScores: number[] = [];
    const strengths: Set<string> = new Set(profile.strengths);
    const weaknesses: Set<string> = new Set(profile.weaknesses);
    const recentTopics: Set<string> = new Set(profile.recentTopics);

    // Track completed courses/lectures for context
    const completedCourseNames: Set<string> = new Set();
    const recentLessonTopics: Set<string> = new Set();

    // Process completed lectures
    for (const lc of completedLectures) {
      if (lc.lecture?.course?.title) {
        completedCourseNames.add(lc.lecture.course.title);
      }
      if (lc.lecture?.title) {
        recentLessonTopics.add(lc.lecture.title);
      }
    }

    // Add assessment scores
    for (const assessment of completedAssessments) {
      allScores.push(assessment.score);
    }

    // Process simulation sessions
    for (const session of sessions) {
      if (session.metrics) {
        try {
          const metrics = JSON.parse(session.metrics as string);
          if (metrics.aiEvaluatedScore) {
            allScores.push(metrics.aiEvaluatedScore);
          }
        } catch {}
      }
      if (session.scenarioType) {
        recentTopics.add(session.scenarioType);
      }
    }

    // Process voice sessions
    for (const session of voiceSessions) {
      if (session.overallScore) {
        allScores.push(session.overallScore);
      }
      if (session.analysis) {
        try {
          const analysis = JSON.parse(session.analysis as string);
          if (analysis.strengths) {
            analysis.strengths.forEach((s: string) => strengths.add(s));
          }
          if (analysis.weaknesses) {
            analysis.weaknesses.forEach((w: string) => weaknesses.add(w));
          }
        } catch {}
      }
    }

    // Fetch interaction reports for more detailed analysis
    const reports = await this.prisma.interactionReport.findMany({
      where: { traineeId },
      orderBy: { generatedAt: 'desc' },
      take: 5,
    });

    for (const report of reports) {
      if (report.summary) {
        try {
          const summary = JSON.parse(report.summary as string);
          if (summary.skillScores) {
            Object.entries(summary.skillScores).forEach(([skill, data]: [string, any]) => {
              if (data.score >= 80) {
                strengths.add(skill);
              } else if (data.score < 60) {
                weaknesses.add(skill);
              }
            });
          }
        } catch {}
      }
    }

    // Update profile
    const averageScore = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : profile.averageScore;

    // Merge recent topics from lessons and simulations
    const allRecentTopics = new Set([
      ...Array.from(recentLessonTopics),
      ...Array.from(recentTopics),
    ]);

    const updatedProfile: TraineeProfile = {
      ...profile,
      totalSessions: sessions.length + voiceSessions.length,
      averageScore,
      strengths: Array.from(strengths).slice(0, 5),
      weaknesses: Array.from(weaknesses).slice(0, 5),
      recentTopics: Array.from(allRecentTopics).slice(0, 8), // Include more topics
      improvementAreas: Array.from(weaknesses).slice(0, 3),
      // Add new fields for course progress
      completedCoursesCount: completedCourseNames.size,
      completedLecturesCount: completedLectures.length,
      completedAssessmentsCount: completedAssessments.length,
      updatedAt: new Date(),
    };

    await this.saveProfile(updatedProfile);
    return updatedProfile;
  }

  private async saveProfile(profile: TraineeProfile): Promise<void> {
    const markdown = this.generateProfileMarkdown(profile);
    const profilePath = this.getProfilePath(profile.traineeId);
    await fs.writeFile(profilePath, markdown, 'utf-8');
  }

  private generateProfileMarkdown(profile: TraineeProfile): string {
    // Generate session notes section (last 5 notes)
    const sessionNotesSection = profile.sessionNotes && profile.sessionNotes.length > 0
      ? profile.sessionNotes.slice(-5).map(note => `
#### ${note.timestamp} - ${note.topic}
${note.summary}
${note.insightsGained.length > 0 ? `\n**Insights Gained:**\n${note.insightsGained.map(i => `- ${i}`).join('\n')}` : ''}
${note.areasToReview.length > 0 ? `\n**Areas to Review:**\n${note.areasToReview.map(a => `- ${a}`).join('\n')}` : ''}
`).join('\n')
      : '- No session notes yet';

    return `# Trainee Profile: ${profile.firstName} ${profile.lastName}

## Basic Information
- **ID**: ${profile.traineeId}
- **Email**: ${profile.email}
- **Created**: ${profile.createdAt.toISOString()}
- **Last Updated**: ${profile.updatedAt.toISOString()}

## Learning Profile
- **Preferred Learning Style**: ${profile.preferredLearningStyle}
- **Communication Preference**: ${profile.communicationPreference}
- **Language**: ${profile.language}

### Personality Traits
${profile.personalityTraits.map(t => `- ${t}`).join('\n') || '- Not assessed yet'}

## Performance Summary
- **Total Sessions**: ${profile.totalSessions}
- **Average Score**: ${profile.averageScore}%
- **Current Streak**: ${profile.currentStreak} days
- **Courses Completed**: ${profile.completedCoursesCount || 0}
- **Lectures Completed**: ${profile.completedLecturesCount || 0}
- **Assessments Completed**: ${profile.completedAssessmentsCount || 0}
- **Last Active**: ${profile.lastActiveAt?.toISOString() || 'Never'}

### Strengths
${profile.strengths.map(s => `- ${s}`).join('\n') || '- Not identified yet'}

### Weaknesses
${profile.weaknesses.map(w => `- ${w}`).join('\n') || '- Not identified yet'}

### Knowledge Gaps
${profile.knowledgeGaps.map(g => `- ${g}`).join('\n') || '- Not identified yet'}

### Recent Topics
${profile.recentTopics.map(t => `- ${t}`).join('\n') || '- No recent activity'}

### Areas for Improvement
${profile.improvementAreas.map(a => `- ${a}`).join('\n') || '- Not identified yet'}

## Preferences

### Likes
${profile.likes.map(l => `- ${l}`).join('\n') || '- Not specified'}

### Dislikes
${profile.dislikes.map(d => `- ${d}`).join('\n') || '- Not specified'}

## AI Teacher Session Notes (Recent)
${sessionNotesSection}

---
*This profile is automatically updated based on training performance and AI Teacher interactions.*
`;
  }

  private parseProfileMarkdown(content: string, traineeId: string): TraineeProfile {
    // Parse sections from markdown
    const extractList = (section: string): string[] => {
      const match = content.match(new RegExp(`### ${section}\\n([\\s\\S]*?)(?=\\n###|\\n##|\\n---|$)`));
      if (!match) return [];
      return match[1]
        .split('\n')
        .filter(line => line.startsWith('- ') && !line.includes('Not'))
        .map(line => line.replace('- ', '').trim());
    };

    const extractValue = (pattern: string, defaultValue: string): string => {
      const match = content.match(new RegExp(`\\*\\*${pattern}\\*\\*: (.+)`));
      return match ? match[1].trim() : defaultValue;
    };

    // Extract basic info
    const nameMatch = content.match(/# Trainee Profile: (.+) (.+)/);
    const firstName = nameMatch?.[1] || '';
    const lastName = nameMatch?.[2] || '';

    // Parse session notes section
    const sessionNotes: SessionNote[] = [];
    const sessionNotesSection = content.match(/## AI Teacher Session Notes.*?\n([\s\S]*?)(?=\n---|\n##|$)/);
    if (sessionNotesSection) {
      const noteBlocks = sessionNotesSection[1].split(/\n####/).filter(b => b.trim() && !b.includes('No session notes'));
      for (const block of noteBlocks) {
        const headerMatch = block.match(/^\s*(.+?) - (.+?)\n/);
        if (headerMatch) {
          const insightsMatch = block.match(/\*\*Insights Gained:\*\*\n([\s\S]*?)(?=\*\*|$)/);
          const areasMatch = block.match(/\*\*Areas to Review:\*\*\n([\s\S]*?)(?=\*\*|$)/);

          sessionNotes.push({
            timestamp: headerMatch[1].trim(),
            topic: headerMatch[2].trim(),
            summary: block.replace(headerMatch[0], '').split('\n**')[0].trim(),
            insightsGained: insightsMatch
              ? insightsMatch[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
              : [],
            areasToReview: areasMatch
              ? areasMatch[1].split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2).trim())
              : [],
          });
        }
      }
    }

    return {
      traineeId,
      firstName,
      lastName,
      email: extractValue('Email', ''),
      personalityTraits: extractList('Personality Traits'),
      preferredLearningStyle: extractValue('Preferred Learning Style', 'mixed') as any,
      communicationPreference: extractValue('Communication Preference', 'casual') as any,
      language: extractValue('Language', 'ar') as 'ar' | 'en',
      strengths: extractList('Strengths'),
      weaknesses: extractList('Weaknesses'),
      knowledgeGaps: extractList('Knowledge Gaps'),
      likes: extractList('Likes'),
      dislikes: extractList('Dislikes'),
      totalSessions: parseInt(extractValue('Total Sessions', '0')) || 0,
      averageScore: parseInt(extractValue('Average Score', '0')) || 0,
      currentStreak: parseInt(extractValue('Current Streak', '0')) || 0,
      lastActiveAt: null,
      recentTopics: extractList('Recent Topics'),
      improvementAreas: extractList('Areas for Improvement'),
      sessionNotes,
      createdAt: new Date(extractValue('Created', new Date().toISOString())),
      updatedAt: new Date(extractValue('Last Updated', new Date().toISOString())),
    };
  }

  /**
   * Add a session note to the trainee's profile after a meaningful AI Teacher interaction
   */
  async addSessionNote(traineeId: string, note: SessionNote): Promise<void> {
    const profile = await this.getOrCreateProfile(traineeId);

    // Keep only the last 10 session notes to prevent file bloat
    const updatedNotes = [...(profile.sessionNotes || []), note].slice(-10);

    await this.updateProfile(traineeId, {
      sessionNotes: updatedNotes,
      updatedAt: new Date(),
    });
  }

  // ============================================================================
  // CHAT & WELCOME
  // ============================================================================

  // Cache for welcome messages to avoid repeated LLM calls
  private welcomeCache: Map<string, { welcome: WelcomeResponse; timestamp: number }> = new Map();
  private readonly WELCOME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async generateWelcome(traineeId: string): Promise<WelcomeResponse> {
    // Check cache first
    const cached = this.welcomeCache.get(traineeId);
    if (cached && Date.now() - cached.timestamp < this.WELCOME_CACHE_TTL) {
      return cached.welcome;
    }

    // Get profile (create if needed, but don't wait for full sync)
    const profile = await this.getOrCreateProfile(traineeId);

    // Generate a quick template-based greeting first (instant response)
    const isArabic = profile.language === 'ar';

    // Quick template greeting while AI generates a better one
    let greeting = this.generateTemplateGreeting(profile, isArabic);

    // Try to get AI-generated greeting with a short timeout
    try {
      const aiGreeting = await Promise.race([
        this.generateAIGreeting(profile, isArabic),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000) // 8 second timeout
        ),
      ]) as string;

      if (aiGreeting) {
        greeting = aiGreeting;
      }
    } catch {
      // Using template greeting - AI timed out or failed
    }

    // Generate suggested topics based on weaknesses
    const suggestedTopics = profile.weaknesses.length > 0
      ? profile.weaknesses.slice(0, 3)
      : isArabic
        ? ['أساسيات المبيعات العقارية', 'التعامل مع الاعتراضات', 'مهارات التفاوض']
        : ['Real Estate Sales Basics', 'Handling Objections', 'Negotiation Skills'];

    // Generate audio if ElevenLabs key is available (do this in background)
    let greetingAudio: string | undefined;
    if (this.elevenLabsApiKey) {
      try {
        greetingAudio = await this.textToSpeech(greeting, profile.language);
      } catch {
        // Audio generation failed - continue without audio
      }
    }

    const welcome: WelcomeResponse = {
      greeting,
      greetingAudio,
      recentProgress: {
        sessionsCompleted: profile.totalSessions,
        averageScore: profile.averageScore,
        improvement: profile.averageScore > 70 ? 'excellent' : profile.averageScore > 50 ? 'good' : 'needs_work',
      },
      suggestedTopics,
    };

    // Cache the result
    this.welcomeCache.set(traineeId, { welcome, timestamp: Date.now() });

    // Sync profile in background (don't wait)
    this.syncProfileWithPerformance(traineeId).catch(() => {
      // Background sync failed - non-critical
    });

    return welcome;
  }

  /**
   * Generate a quick template-based greeting (no AI call)
   */
  private generateTemplateGreeting(profile: TraineeProfile, isArabic: boolean): string {
    const name = profile.firstName;
    const sessions = profile.totalSessions;
    const score = profile.averageScore;

    if (isArabic) {
      if (sessions === 0) {
        return `أهلاً وسهلاً ${name}! 🏠\n\nيسعدني أن أكون معلمك اليوم. أنا هنا لمساعدتك في رحلة تعلم العقارات.\n\nإيش تحب نبدأ فيه اليوم؟`;
      } else if (score >= 70) {
        return `أهلاً ${name}! 🌟\n\nما شاء الله عليك! أداءك ممتاز مع ${sessions} جلسة ومعدل ${score}%.\n\nإيش تبي نركز عليه اليوم؟`;
      } else {
        return `مرحباً ${name}! 👋\n\nحياك الله! عندك ${sessions} جلسة مكتملة. استمر في التدريب وراح تتحسن.\n\nإيش يهمك تتعلم اليوم؟`;
      }
    } else {
      if (sessions === 0) {
        return `Welcome ${name}! 🏠\n\nI'm excited to be your teacher today. I'm here to help you on your real estate learning journey.\n\nWhat would you like to start with today?`;
      } else if (score >= 70) {
        return `Hello ${name}! 🌟\n\nGreat work! Your performance is excellent with ${sessions} sessions and ${score}% average.\n\nWhat would you like to focus on today?`;
      } else {
        return `Hi ${name}! 👋\n\nGood to see you! You have ${sessions} completed sessions. Keep practicing and you'll improve.\n\nWhat would you like to learn today?`;
      }
    }
  }

  /**
   * Generate AI-powered personalized greeting
   */
  private async generateAIGreeting(profile: TraineeProfile, isArabic: boolean): Promise<string> {
    const greetingPrompt = isArabic
      ? `أنت معلم ذكاء اصطناعي ودود ومحترف لتدريب وكلاء العقارات السعوديين.

اسم المتدرب: ${profile.firstName} ${profile.lastName}
عدد الجلسات المكتملة: ${profile.totalSessions}
متوسط الدرجات: ${profile.averageScore}%
نقاط القوة: ${profile.strengths.join('، ') || 'لم تحدد بعد'}
نقاط الضعف: ${profile.weaknesses.join('، ') || 'لم تحدد بعد'}
المواضيع الأخيرة: ${profile.recentTopics.join('، ') || 'لا يوجد'}

اكتب تحية ترحيبية قصيرة وشخصية (2-3 جمل فقط) تذكر فيها:
1. اسم المتدرب
2. ملاحظة إيجابية عن تقدمه أو تشجيع للبدء
3. سؤال مفتوح عما يريد تعلمه اليوم

اكتب باللهجة السعودية الودية.`
      : `You are a friendly, professional AI teacher for Saudi real estate agent training.

Trainee name: ${profile.firstName} ${profile.lastName}
Sessions completed: ${profile.totalSessions}
Average score: ${profile.averageScore}%
Strengths: ${profile.strengths.join(', ') || 'Not identified yet'}
Weaknesses: ${profile.weaknesses.join(', ') || 'Not identified yet'}
Recent topics: ${profile.recentTopics.join(', ') || 'None'}

Write a short, personalized welcome greeting (2-3 sentences only) that:
1. Addresses the trainee by name
2. Makes a positive note about their progress or encourages them to start
3. Asks an open question about what they want to learn today

Be warm and professional.`;

    return this.fallbackProvider.complete({
      prompt: greetingPrompt,
      maxTokens: 300,
      temperature: 0.7,
    });
  }

  async sendMessage(traineeId: string, message: string, attachments?: FileAttachment[], lessonContext?: LessonContext): Promise<ChatResponse> {
    // Get profile for context
    const profile = await this.getOrCreateProfile(traineeId);
    const profileMarkdown = this.generateProfileMarkdown(profile);

    const isArabic = profile.language === 'ar';

    // Build context from attachments
    let attachmentContext = '';
    if (attachments && attachments.length > 0) {
      attachmentContext = '\n\nالمرفقات المقدمة من المتدرب:\n';
      for (const attachment of attachments) {
        if (attachment.extractedText) {
          attachmentContext += `--- ${attachment.filename} ---\n${attachment.extractedText}\n\n`;
        }
      }
    }

    // Build lesson context section if available
    let lessonContextSection = '';
    if (lessonContext) {
      lessonContextSection = isArabic
        ? `

## سياق الدرس الحالي (المتدرب يدرس هذا الدرس الآن):
- **الدرس**: ${lessonContext.lessonNameAr}
- **الوصف**: ${lessonContext.lessonDescriptionAr}
- **الدورة**: ${lessonContext.courseNameAr}
- **الفئة**: ${lessonContext.courseCategory}
- **المستوى**: ${lessonContext.courseDifficulty}
- **أهداف الدورة**: ${lessonContext.courseObjectivesAr?.join('، ') || 'غير محددة'}
${lessonContext.videoDurationMinutes ? `- **مدة الفيديو**: ${lessonContext.videoDurationMinutes} دقيقة` : ''}

🎯 **تعليمات خاصة بالدرس**:
- ركز إجاباتك على محتوى هذا الدرس المحدد
- اربط شرحك بأهداف الدورة
- قدم أمثلة عملية متعلقة بالموضوع
- إذا سأل المتدرب سؤالاً عاماً، حاول ربطه بالدرس الحالي
`
        : `

## Current Lesson Context (trainee is studying this lesson):
- **Lesson**: ${lessonContext.lessonName}
- **Description**: ${lessonContext.lessonDescription}
- **Course**: ${lessonContext.courseName}
- **Category**: ${lessonContext.courseCategory}
- **Difficulty**: ${lessonContext.courseDifficulty}
- **Course Objectives**: ${lessonContext.courseObjectives?.join(', ') || 'Not specified'}
${lessonContext.videoDurationMinutes ? `- **Video Duration**: ${lessonContext.videoDurationMinutes} minutes` : ''}

🎯 **Lesson-Specific Instructions**:
- Focus your answers on this specific lesson content
- Relate your explanations to the course objectives
- Provide practical examples related to the topic
- If the trainee asks a general question, try to relate it to the current lesson
`;
    }

    // System prompt with profile context
    const systemPrompt = isArabic
      ? `أنت "المعلم الذكي" - معلم ذكاء اصطناعي متخصص في تدريب وكلاء العقارات السعوديين.

## ملف المتدرب (استخدمه لتخصيص ردودك):
${profileMarkdown}
${lessonContextSection}

## قواعدك:
1. تحدث باللهجة السعودية الودية والمهنية
2. خصص ردودك بناءً على نقاط قوة وضعف المتدرب
3. لا تكتفِ بالإجابة - اطرح أسئلة لاختبار الفهم الحقيقي
4. ركز على التطبيق العملي في سوق العقارات السعودي
5. شجع المتدرب وادعمه مع تقديم نقد بناء
6. إذا طُلب منك موضوع خارج العقارات، وجه المحادثة بلطف للتركيز على التدريب
${attachmentContext}`
      : `You are "AI Teacher" - an AI mentor specializing in training Saudi real estate agents.

## Trainee Profile (use this to personalize your responses):
${profileMarkdown}
${lessonContextSection}

## Your Rules:
1. Be warm, professional, and encouraging
2. Personalize responses based on trainee's strengths and weaknesses
3. Don't just answer - ask questions to test true comprehension
4. Focus on practical application in the Saudi real estate market
5. Provide constructive feedback while being supportive
6. If asked about off-topic subjects, gently redirect to training focus
${attachmentContext}`;

    // Generate response using Gemini 2.0 Flash for low-latency
    const response = await this.fallbackProvider.complete({
      prompt: message,
      systemPrompt,
      maxTokens: 800,
      temperature: 0.7,
    });

    // Extract any follow-up questions from the response
    const followUpQuestions = this.extractFollowUpQuestions(response, isArabic);

    // Check if we should add an assessment question
    let assessmentQuestion = undefined;
    if (Math.random() < 0.3) { // 30% chance to ask assessment
      assessmentQuestion = await this.generateAssessmentQuestion(profile, message, isArabic);
    }

    // Generate audio for response if available
    let audioBase64: string | undefined;
    if (this.elevenLabsApiKey) {
      try {
        // Only generate audio for shorter responses
        if (response.length < 500) {
          audioBase64 = await this.textToSpeech(response, profile.language);
        }
      } catch {
        // Audio generation failed - continue without audio
      }
    }

    // Update session with lesson context for learning insights
    this.updateSession(traineeId, message, response, lessonContext);

    return {
      message: response,
      audioBase64,
      followUpQuestions,
      assessmentQuestion,
    };
  }

  /**
   * Send a message with streaming response for real-time UI updates
   * Uses Gemini 2.0 Flash streaming API for chunk-by-chunk delivery
   */
  async *sendMessageStream(
    traineeId: string,
    message: string,
    attachments?: FileAttachment[],
    lessonContext?: LessonContext
  ): AsyncGenerator<StreamingChatResponse, void, unknown> {
    // Get profile for context
    const profile = await this.getOrCreateProfile(traineeId);
    const profileMarkdown = this.generateProfileMarkdown(profile);

    const isArabic = profile.language === 'ar';

    // Build context from attachments
    let attachmentContext = '';
    if (attachments && attachments.length > 0) {
      attachmentContext = '\n\nالمرفقات المقدمة من المتدرب:\n';
      for (const attachment of attachments) {
        if (attachment.extractedText) {
          attachmentContext += `--- ${attachment.filename} ---\n${attachment.extractedText}\n\n`;
        }
      }
    }

    // Build lesson context section if available
    let lessonContextSection = '';
    if (lessonContext) {
      lessonContextSection = isArabic
        ? `\n\n## سياق الدرس الحالي:\n- **الدرس**: ${lessonContext.lessonNameAr}\n- **الوصف**: ${lessonContext.lessonDescriptionAr}\n- **الدورة**: ${lessonContext.courseNameAr}`
        : `\n\n## Current Lesson Context:\n- **Lesson**: ${lessonContext.lessonName}\n- **Description**: ${lessonContext.lessonDescription}\n- **Course**: ${lessonContext.courseName}`;
    }

    // System prompt with profile context
    const systemPrompt = isArabic
      ? `أنت "المعلم الذكي" - معلم ذكاء اصطناعي متخصص في تدريب وكلاء العقارات السعوديين.\n\n## ملف المتدرب:\n${profileMarkdown}${lessonContextSection}\n\n## قواعدك:\n1. تحدث باللهجة السعودية الودية والمهنية\n2. خصص ردودك بناءً على نقاط قوة وضعف المتدرب\n3. لا تكتفِ بالإجابة - اطرح أسئلة لاختبار الفهم\n4. ركز على التطبيق العملي في سوق العقارات السعودي${attachmentContext}`
      : `You are "AI Teacher" - an AI mentor specializing in training Saudi real estate agents.\n\n## Trainee Profile:\n${profileMarkdown}${lessonContextSection}\n\n## Your Rules:\n1. Be warm, professional, and encouraging\n2. Personalize responses based on trainee's strengths and weaknesses\n3. Don't just answer - ask questions to test comprehension\n4. Focus on practical application in the Saudi real estate market${attachmentContext}`;

    let fullMessage = '';
    let firstSentenceComplete = false;
    let firstSentence = '';
    let firstSentenceAudioPromise: Promise<string | undefined> | null = null;

    try {
      // Stream response using Gemini
      for await (const chunk of this.fallbackProvider.streamComplete({
        prompt: message,
        systemPrompt,
        maxTokens: 800,
        temperature: 0.7,
      })) {
        fullMessage += chunk;

        // Pre-render audio for first sentence as soon as it's complete
        // Look for sentence-ending punctuation (Arabic or English)
        if (!firstSentenceComplete && this.elevenLabsApiKey) {
          const sentenceEndMatch = fullMessage.match(/^(.*?[.!?؟\n])/);
          if (sentenceEndMatch && sentenceEndMatch[1].length >= 20) {
            firstSentenceComplete = true;
            firstSentence = sentenceEndMatch[1].trim();

            // Start audio generation in background (don't await)
            firstSentenceAudioPromise = this.textToSpeech(firstSentence, profile.language)
              .catch(() => undefined);
          }
        }

        yield {
          type: 'chunk',
          content: chunk,
        };
      }

      // Extract follow-up questions from full message
      const followUpQuestions = this.extractFollowUpQuestions(fullMessage, isArabic);

      // Check if we should add an assessment question (20% chance for streaming)
      let assessmentQuestion = undefined;
      if (Math.random() < 0.2) {
        assessmentQuestion = await this.generateAssessmentQuestion(profile, message, isArabic);
      }

      // Get pre-rendered audio for first sentence, or generate for full message if short
      let audioBase64: string | undefined;
      if (firstSentenceAudioPromise) {
        // Use pre-rendered first sentence audio
        audioBase64 = await firstSentenceAudioPromise;
      } else if (this.elevenLabsApiKey && fullMessage.length < 500) {
        // Fallback: generate audio for the full message if it's short
        try {
          audioBase64 = await this.textToSpeech(fullMessage, profile.language);
        } catch {
          // Audio generation failed - continue without audio
        }
      }

      // Update session
      this.updateSession(traineeId, message, fullMessage, lessonContext);

      // Send final done event with full message and metadata
      yield {
        type: 'done',
        fullMessage,
        audioBase64,
        followUpQuestions,
        assessmentQuestion,
      };
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private extractFollowUpQuestions(response: string, isArabic: boolean): string[] {
    // Find questions in the response
    const questionPattern = isArabic ? /[؟?][^؟?]*/g : /\?[^?]*/g;
    const questions: string[] = [];

    // Simple extraction - find sentences ending with ?
    const sentences = response.split(/[.؟?]/);
    for (const sentence of sentences) {
      if (sentence.trim().length > 10 && sentence.trim().length < 100) {
        if (isArabic && response.includes(sentence + '؟')) {
          questions.push(sentence.trim() + '؟');
        } else if (!isArabic && response.includes(sentence + '?')) {
          questions.push(sentence.trim() + '?');
        }
      }
    }

    return questions.slice(0, 2);
  }

  private async generateAssessmentQuestion(
    profile: TraineeProfile,
    topic: string,
    isArabic: boolean
  ): Promise<{ question: string; type: 'multiple_choice' | 'open_ended' | 'true_false'; options?: string[] } | undefined> {
    // Focus on weak areas
    const weakArea = profile.weaknesses[0] || 'general sales skills';

    const prompt = isArabic
      ? `اكتب سؤال اختبار قصير عن "${weakArea}" في مجال العقارات السعودية.

اختر نوع واحد فقط:
1. سؤال اختيار متعدد (4 خيارات)
2. سؤال مفتوح قصير
3. سؤال صح/خطأ

أجب بصيغة JSON فقط:
{
  "question": "نص السؤال",
  "type": "multiple_choice" أو "open_ended" أو "true_false",
  "options": ["خيار1", "خيار2", "خيار3", "خيار4"] // فقط للاختيار المتعدد
}`
      : `Write a short quiz question about "${weakArea}" in Saudi real estate.

Choose ONE type:
1. Multiple choice (4 options)
2. Short open-ended question
3. True/false

Answer in JSON only:
{
  "question": "question text",
  "type": "multiple_choice" or "open_ended" or "true_false",
  "options": ["opt1", "opt2", "opt3", "opt4"] // only for multiple choice
}`;

    try {
      const result = await this.fallbackProvider.complete({
        prompt,
        maxTokens: 300,
        temperature: 0.5,
      });

      // Parse JSON
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());
      return {
        question: parsed.question,
        type: parsed.type,
        options: parsed.options,
      };
    } catch {
      return undefined;
    }
  }

  private updateSession(traineeId: string, userMessage: string, assistantMessage: string, lessonContext?: LessonContext): void {
    let session = this.sessionCache.get(traineeId);

    if (!session) {
      session = {
        id: `session-${traineeId}-${Date.now()}`,
        traineeId,
        messages: [],
        startedAt: new Date(),
        lastMessageAt: new Date(),
        status: 'active',
      };
    }

    session.messages.push(
      {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: userMessage,
        timestamp: new Date(),
      },
      {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: assistantMessage,
        timestamp: new Date(),
      }
    );
    session.lastMessageAt = new Date();

    // Update topic from lesson context if available
    if (lessonContext) {
      session.topic = lessonContext.lessonName;
    }

    this.sessionCache.set(traineeId, session);

    // Update trainee profile with learning insights (async, don't wait)
    this.updateLearningInsights(traineeId, userMessage, assistantMessage, lessonContext).catch(() => {
      // Learning insights update failed - non-critical
    });
  }

  /**
   * Update trainee profile with learning insights based on AI Teacher interactions
   */
  private async updateLearningInsights(
    traineeId: string,
    userMessage: string,
    assistantMessage: string,
    lessonContext?: LessonContext
  ): Promise<void> {
    try {
      const profile = await this.getOrCreateProfile(traineeId);

      // Track recently studied topics
      if (lessonContext) {
        const topicName = profile.language === 'ar' ? lessonContext.lessonNameAr : lessonContext.lessonName;
        if (!profile.recentTopics.includes(topicName)) {
          profile.recentTopics = [topicName, ...profile.recentTopics].slice(0, 5);
        }
      }

      // Increment total sessions (approximately - one per conversation)
      const session = this.sessionCache.get(traineeId);
      if (session && session.messages.length === 2) {
        // Only count first message exchange as a "session start"
        profile.totalSessions += 1;
      }

      // Update last active
      profile.lastActiveAt = new Date();

      // Save updated profile
      await this.saveProfile(profile);

      // Update trainee record in database
      await this.prisma.trainee.update({
        where: { id: traineeId },
        data: {
          lastActiveAt: new Date(),
        },
      });

      // Generate and save session note after every 5th message or when lesson context changes
      const shouldGenerateNote = session && (
        session.messages.length % 10 === 0 || // Every 5 exchanges (10 messages)
        (lessonContext && session.messages.length === 2) // First exchange with lesson context
      );

      if (shouldGenerateNote) {
        this.generateAndSaveSessionNote(traineeId, session, profile.language, lessonContext).catch(() => {
          // Non-critical - session note generation can fail silently
        });
      }
    } catch {
      // Non-critical - learning insights update can fail silently
    }
  }

  /**
   * Generate a session note using AI to summarize the learning insights
   */
  private async generateAndSaveSessionNote(
    traineeId: string,
    session: TeacherSession,
    language: 'ar' | 'en',
    lessonContext?: LessonContext
  ): Promise<void> {
    const isArabic = language === 'ar';

    // Get last few messages for context
    const recentMessages = session.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n\n');

    const prompt = isArabic
      ? `بناءً على هذه المحادثة التعليمية، أنشئ ملخصاً قصيراً بصيغة JSON:

المحادثة:
${recentMessages}

${lessonContext ? `الدرس: ${lessonContext.lessonNameAr}` : ''}

أجب بصيغة JSON فقط:
{
  "summary": "ملخص قصير للمحادثة (جملة أو جملتين)",
  "insightsGained": ["معلومة تعلمها المتدرب 1", "معلومة 2"],
  "areasToReview": ["موضوع يحتاج مراجعة"]
}`
      : `Based on this educational conversation, create a brief summary in JSON format:

Conversation:
${recentMessages}

${lessonContext ? `Lesson: ${lessonContext.lessonName}` : ''}

Respond in JSON only:
{
  "summary": "Brief summary of the conversation (1-2 sentences)",
  "insightsGained": ["insight the trainee learned 1", "insight 2"],
  "areasToReview": ["topic that needs review"]
}`;

    try {
      const result = await this.fallbackProvider.complete({
        prompt,
        maxTokens: 500,
        temperature: 0.3,
      });

      // Parse JSON
      let jsonStr = result;
      const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      const note: SessionNote = {
        timestamp: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        topic: lessonContext
          ? (isArabic ? lessonContext.lessonNameAr : lessonContext.lessonName)
          : (isArabic ? 'محادثة عامة' : 'General Conversation'),
        summary: parsed.summary || '',
        insightsGained: parsed.insightsGained || [],
        areasToReview: parsed.areasToReview || [],
      };

      await this.addSessionNote(traineeId, note);
    } catch {
      // Session note generation failed - non-critical
    }
  }

  async getSessionHistory(traineeId: string, limit: number = 10): Promise<TeacherSession[]> {
    // For now, return from cache
    // In production, this would query the database
    const session = this.sessionCache.get(traineeId);
    return session ? [session] : [];
  }

  // ============================================================================
  // VOICE SYNTHESIS
  // ============================================================================

  async textToSpeech(text: string, language: 'ar' | 'en'): Promise<string> {
    if (!this.elevenLabsApiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = VOICE_IDS[language];

    // Use eleven_turbo_v2_5 for faster generation with good quality
    // For Arabic, use eleven_multilingual_v2 for better pronunciation
    const modelId = language === 'ar' ? 'eleven_multilingual_v2' : 'eleven_turbo_v2_5';

    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}?optimize_streaming_latency=3`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.elevenLabsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }

  async speechToText(audioBuffer: Buffer, language: 'ar' | 'en'): Promise<string> {
    // Use Google Gemini API for speech-to-text
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      throw new Error('Speech-to-text service not configured. Please add GEMINI_API_KEY to .env file.');
    }

    // Convert audio buffer to base64
    const audioBase64 = audioBuffer.toString('base64');

    // Use Gemini's multimodal capabilities to transcribe audio (stable model version)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: language === 'ar'
                ? 'قم بتحويل هذا الملف الصوتي إلى نص. أعد النص المنطوق فقط بدون أي تعليقات أو شرح.'
                : 'Transcribe this audio file to text. Return only the spoken text without any comments or explanation.'
            },
            {
              inline_data: {
                mime_type: 'audio/webm',
                data: audioBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      // Check for rate limit errors
      if (response.status === 429 || error.includes('RESOURCE_EXHAUSTED') || error.includes('quota')) {
        throw new Error(language === 'ar'
          ? 'تم تجاوز حد الاستخدام. يرجى المحاولة بعد دقيقة.'
          : 'Rate limit exceeded. Please try again in a minute.');
      }

      throw new Error(`Speech-to-text failed: ${response.status} - ${error}`);
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      error?: { message: string };
    };

    // Check for error in response body
    if (result.error) {
      throw new Error(result.error.message);
    }

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  }

  // ============================================================================
  // FILE PROCESSING
  // ============================================================================

  async processUploadedFile(file: Buffer, filename: string, mimeType: string): Promise<FileAttachment> {
    let extractedText = '';

    // Extract text based on file type
    if (mimeType === 'application/pdf') {
      extractedText = await this.extractPdfText(file);
    } else if (mimeType.includes('text/') || mimeType === 'application/json') {
      extractedText = file.toString('utf-8');
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
      // For Word docs, note it was uploaded (would need mammoth library for full extraction)
      extractedText = '[Word document uploaded - content will be analyzed by the AI Teacher]';
    } else if (mimeType.startsWith('image/')) {
      // Use Gemini's multimodal capabilities to describe the image
      extractedText = await this.extractImageContent(file, mimeType);
    } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
      // Note PowerPoint upload - Gemini can potentially analyze if converted
      extractedText = '[PowerPoint presentation uploaded - slides will be analyzed for educational content]';
    }

    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filename,
      mimeType,
      size: file.length,
      extractedText: extractedText.slice(0, 15000), // Limit extracted text
    };
  }

  /**
   * Extract content description from images using Gemini's multimodal capabilities
   */
  private async extractImageContent(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return '[Image uploaded - visual analysis not available without Gemini API key]';
    }

    try {
      const imageBase64 = imageBuffer.toString('base64');

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `Analyze this image in the context of real estate training. Describe:
1. What the image shows (property, document, chart, etc.)
2. Key details relevant to real estate (features, layout, location cues)
3. Any text visible in the image
4. How this could be used for training purposes

Respond in both Arabic and English. Be concise but informative.`
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1000,
            }
          }),
        }
      );

      if (!response.ok) {
        return '[Image uploaded - could not analyze image content]';
      }

      const result = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const description = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return description || '[Image uploaded - no description available]';
    } catch {
      return '[Image uploaded - error analyzing image]';
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // Convert Buffer to Uint8Array (required by pdf-parse v2)
      const uint8Array = new Uint8Array(buffer);

      // Use pdf-parse library for proper PDF text extraction
      const parser = new PDFParse(uint8Array);
      await parser.load();
      const result = await parser.getText();

      // Extract text from all pages
      const pageTexts = result.pages.map((page: { text: string; num: number }) => page.text).filter((t: string) => t.trim().length > 0);
      const fullText = pageTexts.join('\n\n');

      // Clean up the parser
      parser.destroy();

      if (fullText.trim().length > 0) {
        // Clean up the text - remove excessive whitespace
        const cleanedText = fullText
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 15000); // Limit to 15k chars to avoid overwhelming the LLM

        return cleanedText;
      }

      return '[لم يتم العثور على نص قابل للقراءة في هذا الملف PDF. يبدو أن الملف عبارة عن صورة ممسوحة ضوئياً بدون طبقة نصية. يرجى رفع ملف PDF يحتوي على نص قابل للتحديد والنسخ. / PDF has no readable text - it appears to be a scanned image without a text layer. Please upload a PDF with selectable text.]';
    } catch {
      return '[فشل استخراج النص من الملف. قد يكون الملف مشفراً أو تالفاً. / Text extraction failed. The file may be encrypted or corrupted.]';
    }
  }

  // ============================================================================
  // GEMINI-POWERED EDUCATIONAL CONTENT GENERATION
  // ============================================================================

  /**
   * Generate an educational summary for a lesson using Gemini
   */
  async generateLessonSummary(lessonContext: LessonContext, language: 'ar' | 'en'): Promise<{
    summary: string;
    keyPoints: string[];
    practicalTips: string[];
  }> {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Validate lesson context
    if (!lessonContext) {
      throw new Error('Lesson context is required');
    }

    const isArabic = language === 'ar';
    const lessonName = (isArabic ? lessonContext.lessonNameAr : lessonContext.lessonName) || 'Unknown Lesson';
    const lessonDescription = (isArabic ? lessonContext.lessonDescriptionAr : lessonContext.lessonDescription) || '';
    const courseName = (isArabic ? lessonContext.courseNameAr : lessonContext.courseName) || 'Unknown Course';
    const objectives = (isArabic ? lessonContext.courseObjectivesAr : lessonContext.courseObjectives) || [];

    const prompt = isArabic
      ? `أنت خبير في التدريب العقاري السعودي. قم بإنشاء ملخص تعليمي للدرس التالي:

الدرس: ${lessonName}
الوصف: ${lessonDescription}
الدورة: ${courseName}
الأهداف: ${objectives?.join('، ') || 'غير محددة'}

أجب بصيغة JSON التالية فقط:
{
  "summary": "ملخص شامل للدرس في 2-3 فقرات",
  "keyPoints": ["نقطة رئيسية 1", "نقطة رئيسية 2", "نقطة رئيسية 3", "نقطة رئيسية 4", "نقطة رئيسية 5"],
  "practicalTips": ["نصيحة عملية 1", "نصيحة عملية 2", "نصيحة عملية 3"]
}

ركز على التطبيق العملي في السوق السعودي واستخدم اللهجة السعودية.`
      : `You are a Saudi real estate training expert. Create an educational summary for the following lesson:

Lesson: ${lessonName}
Description: ${lessonDescription}
Course: ${courseName}
Objectives: ${objectives?.join(', ') || 'Not specified'}

Respond in JSON format only:
{
  "summary": "Comprehensive summary of the lesson in 2-3 paragraphs",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "practicalTips": ["Practical tip 1", "Practical tip 2", "Practical tip 3"]
}

Focus on practical application in the Saudi market.`;

    try {
      // Use gemini-2.0-flash-001 (stable)
      const modelName = 'gemini-2.0-flash-001';

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
        error?: { message: string };
      };

      // Check for API error in response body
      if (result.error) {
        throw new Error(result.error.message);
      }

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        throw new Error('Empty response from Gemini API');
      }

      // Extract JSON from response
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Try to find JSON object in the text if not wrapped in code blocks
      if (!jsonMatch) {
        const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr.trim());
      return {
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        practicalTips: parsed.practicalTips || [],
      };
    } catch (error: any) {

      // Check for rate limit errors
      const errorMessage = error?.message || '';
      const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED');

      if (isRateLimitError) {
        return {
          summary: isArabic
            ? '⚠️ تم تجاوز حد الاستخدام المجاني لخدمة الذكاء الاصطناعي. يرجى المحاولة مرة أخرى بعد دقيقة.'
            : '⚠️ Free tier API quota exceeded. Please try again in a minute.',
          keyPoints: [],
          practicalTips: [],
        };
      }

      return {
        summary: isArabic
          ? 'لم نتمكن من إنشاء الملخص. يرجى المحاولة مرة أخرى.'
          : 'Could not generate summary. Please try again.',
        keyPoints: [],
        practicalTips: [],
      };
    }
  }

  /**
   * Generate a mini-quiz for the current lesson using Gemini
   */
  async generateMiniQuiz(lessonContext: LessonContext, language: 'ar' | 'en', numQuestions: number = 3): Promise<{
    questions: Array<{
      id: string;
      question: string;
      type: 'multiple_choice' | 'true_false';
      options?: string[];
      correctAnswer: string;
      explanation: string;
    }>;
  }> {
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Validate lesson context
    if (!lessonContext) {
      throw new Error('Lesson context is required');
    }

    const isArabic = language === 'ar';
    const lessonName = (isArabic ? lessonContext.lessonNameAr : lessonContext.lessonName) || 'Unknown Lesson';
    const lessonDescription = (isArabic ? lessonContext.lessonDescriptionAr : lessonContext.lessonDescription) || '';
    const courseName = (isArabic ? lessonContext.courseNameAr : lessonContext.courseName) || 'Unknown Course';

    const prompt = isArabic
      ? `أنت خبير في التدريب العقاري السعودي. قم بإنشاء ${numQuestions} أسئلة اختبار قصيرة للدرس التالي:

الدرس: ${lessonName}
الوصف: ${lessonDescription}
الدورة: ${courseName}

أجب بصيغة JSON التالية فقط:
{
  "questions": [
    {
      "id": "q1",
      "question": "نص السؤال",
      "type": "multiple_choice",
      "options": ["خيار أ", "خيار ب", "خيار ج", "خيار د"],
      "correctAnswer": "خيار أ",
      "explanation": "شرح لماذا هذه الإجابة صحيحة"
    }
  ]
}

نوّع بين أسئلة الاختيار المتعدد (4 خيارات) وأسئلة صح/خطأ. ركز على المفاهيم العملية.`
      : `You are a Saudi real estate training expert. Create ${numQuestions} short quiz questions for the following lesson:

Lesson: ${lessonName}
Description: ${lessonDescription}
Course: ${courseName}

Respond in JSON format only:
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text",
      "type": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Explanation of why this answer is correct"
    }
  ]
}

Mix between multiple choice (4 options) and true/false questions. Focus on practical concepts.`;

    try {
      // Use stable model version
      const modelName = 'gemini-2.0-flash-001';

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
        error?: { message: string };
      };

      // Check for API error in response body
      if (result.error) {
        throw new Error(result.error.message);
      }

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        throw new Error('Empty response from Gemini API for quiz');
      }

      // Extract JSON from response
      let jsonStr = text;
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Try to find JSON object in the text if not wrapped in code blocks
      if (!jsonMatch) {
        const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr.trim());
      return {
        questions: parsed.questions || [],
      };
    } catch (error: any) {

      // Check for rate limit errors and propagate them for better user feedback
      const errorMessage = error?.message || '';
      const isRateLimitError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED');

      if (isRateLimitError) {
        throw new Error(isArabic
          ? 'تم تجاوز حد الاستخدام المجاني. يرجى المحاولة بعد دقيقة.'
          : 'Free tier quota exceeded. Please try again in a minute.');
      }

      return { questions: [] };
    }
  }

  /**
   * Generate video timestamp recommendations based on a question
   */
  async generateVideoTimestamps(
    lessonContext: LessonContext,
    question: string,
    language: 'ar' | 'en'
  ): Promise<{
    timestamps: Array<{
      startTime: string;
      endTime: string;
      description: string;
      relevance: 'high' | 'medium' | 'low';
    }>;
  }> {
    // This would ideally work with video transcripts
    // For now, return a placeholder suggesting key sections
    const isArabic = language === 'ar';

    if (!lessonContext.videoDurationMinutes) {
      return { timestamps: [] };
    }

    const duration = lessonContext.videoDurationMinutes;

    // Generate approximate timestamps based on video duration
    const timestamps = [
      {
        startTime: '0:00',
        endTime: `${Math.floor(duration * 0.15)}:00`,
        description: isArabic ? 'مقدمة الدرس والمفاهيم الأساسية' : 'Lesson introduction and basic concepts',
        relevance: 'high' as const,
      },
      {
        startTime: `${Math.floor(duration * 0.3)}:00`,
        endTime: `${Math.floor(duration * 0.6)}:00`,
        description: isArabic ? 'المحتوى الرئيسي والتفاصيل' : 'Main content and details',
        relevance: 'high' as const,
      },
      {
        startTime: `${Math.floor(duration * 0.8)}:00`,
        endTime: `${duration}:00`,
        description: isArabic ? 'الملخص والنقاط الرئيسية' : 'Summary and key points',
        relevance: 'medium' as const,
      },
    ];

    return { timestamps };
  }
}
