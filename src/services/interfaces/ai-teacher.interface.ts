/**
 * AI Teacher Service Interface
 *
 * Provides a personalized AI mentor experience for trainees,
 * leveraging their historical performance data.
 */

// Session note for tracking AI Teacher interactions
export interface SessionNote {
  timestamp: string;
  topic: string;
  summary: string;
  insightsGained: string[];
  areasToReview: string[];
}

export interface TraineeProfile {
  traineeId: string;
  firstName: string;
  lastName: string;
  email: string;

  // Personality & Learning Style
  personalityTraits: string[];
  preferredLearningStyle: 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'mixed';
  communicationPreference: 'formal' | 'casual' | 'mixed';
  language: 'ar' | 'en';

  // Performance Summary
  strengths: string[];
  weaknesses: string[];
  knowledgeGaps: string[];

  // Preferences
  likes: string[];
  dislikes: string[];

  // Progress Summary
  totalSessions: number;
  averageScore: number;
  currentStreak: number;
  lastActiveAt: Date | null;

  // Course Progress - from local courses
  completedCoursesCount?: number;
  completedLecturesCount?: number;
  completedAssessmentsCount?: number;

  // Recent Performance
  recentTopics: string[];
  improvementAreas: string[];

  // Session Notes - AI Teacher interaction logs
  sessionNotes: SessionNote[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  attachments?: FileAttachment[];
}

export interface FileAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  extractedText?: string;
}

export interface TeacherSession {
  id: string;
  traineeId: string;
  messages: ChatMessage[];
  topic?: string;
  startedAt: Date;
  lastMessageAt: Date;
  status: 'active' | 'completed';
}

export interface WelcomeResponse {
  greeting: string;
  greetingAudio?: string; // Base64 encoded audio
  recentProgress: {
    sessionsCompleted: number;
    averageScore: number;
    improvement: string;
  };
  suggestedTopics: string[];
}

export interface ChatResponse {
  message: string;
  audioBase64?: string;
  followUpQuestions?: string[];
  relatedTopics?: string[];
  assessmentQuestion?: {
    question: string;
    type: 'multiple_choice' | 'open_ended' | 'true_false';
    options?: string[];
  };
}

// Lesson context for course integration
export interface LessonContext {
  lessonId: string;
  lessonName: string;
  lessonNameAr: string;
  lessonDescription: string;
  lessonDescriptionAr: string;
  courseId: string;
  courseName: string;
  courseNameAr: string;
  courseCategory: string;
  courseDifficulty: string;
  courseObjectives: string[];
  courseObjectivesAr: string[];
  attachedFiles?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    url?: string;
  }>;
  videoId?: string;
  videoDurationMinutes?: number;
}

export interface StreamingChatResponse {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  fullMessage?: string;
  audioBase64?: string;
  followUpQuestions?: string[];
  assessmentQuestion?: {
    question: string;
    type: 'multiple_choice' | 'open_ended' | 'true_false';
    options?: string[];
  };
  error?: string;
}

export interface IAITeacherService {
  // Profile Management
  getOrCreateProfile(traineeId: string): Promise<TraineeProfile>;
  updateProfile(traineeId: string, updates: Partial<TraineeProfile>): Promise<TraineeProfile>;
  syncProfileWithPerformance(traineeId: string): Promise<TraineeProfile>;

  // Session Management
  generateWelcome(traineeId: string): Promise<WelcomeResponse>;
  sendMessage(traineeId: string, message: string, attachments?: FileAttachment[], lessonContext?: LessonContext): Promise<ChatResponse>;
  sendMessageStream(traineeId: string, message: string, attachments?: FileAttachment[], lessonContext?: LessonContext): AsyncGenerator<StreamingChatResponse>;
  getSessionHistory(traineeId: string, limit?: number): Promise<TeacherSession[]>;

  // Voice
  textToSpeech(text: string, language: 'ar' | 'en'): Promise<string>; // Returns base64 audio
  speechToText(audioBuffer: Buffer, language: 'ar' | 'en'): Promise<string>; // Returns transcribed text

  // File Processing
  processUploadedFile(file: Buffer, filename: string, mimeType: string): Promise<FileAttachment>;
}
