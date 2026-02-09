// AV Content Generation Interfaces
// For generating audio-visual educational content using Gemini + ElevenLabs

export interface IAVContentService {
  generateLecture(params: GenerateLectureParams): Promise<AVContentResult>;
  generateSummary(params: GenerateSummaryParams): Promise<AVContentResult>;
  getContent(contentId: string, traineeId: string): Promise<AVContentWithSlides>;
  listContent(traineeId: string, options: ListOptions): Promise<PaginatedResult<AVContentResult>>;
  submitFeedback(params: SubmitFeedbackParams): Promise<void>;
  deleteContent(contentId: string, traineeId: string): Promise<void>;
}

// Request Parameters
export interface GenerateLectureParams {
  traineeId: string;
  topic: string;
  lessonContext?: string;
  courseId?: string;
  duration?: number;  // target duration in minutes (5-15)
  language: 'ar' | 'en' | 'bilingual';
}

export interface GenerateSummaryParams {
  traineeId: string;
  topic: string;
  sourceText?: string;
  focusAreas?: string[];  // from trainee weaknesses
  language: 'ar' | 'en' | 'bilingual';
}

export interface SubmitFeedbackParams {
  contentId: string;
  traineeId: string;
  rating?: number;
  helpful?: boolean;
  comment?: string;
  watchDuration?: number;
  completedSlides?: number[];
}

export interface ListOptions {
  page?: number;
  limit?: number;
  type?: 'lecture' | 'summary';
}

// Response Types
export interface AVContentResult {
  id: string;
  traineeId: string;
  type: 'lecture' | 'summary';
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  topic: string;
  sourceContext?: string;
  totalDuration: number;
  status: 'generating' | 'ready' | 'failed';
  audioUrl?: string;
  metadata: AVContentMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface AVContentWithSlides extends AVContentResult {
  slides: AVSlideResult[];
}

export interface AVSlideResult {
  id: string;
  slideNumber: number;
  title: string;
  titleAr?: string;
  bulletPoints: string[];
  bulletPointsAr?: string[];
  visualType: 'bullets' | 'diagram' | 'chart' | 'image';
  visualData?: Record<string, any>;
  narrationText: string;
  narrationTextAr?: string;
  audioStartTime: number;
  audioEndTime: number;
  duration: number;
}

export interface AVContentMetadata {
  language: 'ar' | 'en' | 'bilingual';
  voiceId?: string;
  adaptations?: string[];  // trainee-specific adaptations made
  generationModel?: string;
}

// Gemini Response Structure
export interface GeminiLectureResponse {
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  slides: GeminiSlideContent[];
  totalDuration: number;
}

export interface GeminiSlideContent {
  slideNumber: number;
  title: string;
  titleAr?: string;
  bulletPoints: string[];
  bulletPointsAr?: string[];
  visualType: 'bullets' | 'diagram' | 'chart' | 'image';
  visualData?: Record<string, any>;
  narrationText: string;
  narrationTextAr?: string;
  duration: number;  // estimated duration in seconds
}

// Pagination
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Trainee Profile (for adaptive content)
export interface TraineeProfile {
  id: string;
  firstName: string;
  lastName: string;
  weaknesses: string[];
  knowledgeGaps: string[];
  improvementAreas: string[];
  completedTopics: string[];
}
