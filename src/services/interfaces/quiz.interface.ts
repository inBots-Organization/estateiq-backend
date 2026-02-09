import { CreateQuizInput, UpdateQuizInput, SubmitResponseInput, GenerateQuizInput } from '../../dtos/validation/quiz.validation';

// ---- Response DTOs ----

export interface QuizListItem {
  id: string;
  title: string;
  titleAr: string | null;
  description: string;
  descriptionAr: string | null;
  courseId: string | null;
  difficulty: string;
  questionCount: number;
  attemptCount: number;
  timeLimit: number | null;
  passingScore: number;
  isPublished: boolean;
  maxAttempts: number | null;
  quizType: string;
  createdAt: Date;
}

export interface OptionDetail {
  id: string;
  optionText: string;
  optionTextAr: string | null;
  isCorrect: boolean;
  orderInQuestion: number;
}

export interface QuestionDetail {
  id: string;
  questionText: string;
  questionTextAr: string | null;
  questionType: string;
  explanation: string | null;
  explanationAr: string | null;
  points: number;
  orderInQuiz: number;
  options: OptionDetail[];
}

export interface QuizDetail {
  id: string;
  title: string;
  titleAr: string | null;
  description: string;
  descriptionAr: string | null;
  courseId: string | null;
  difficulty: string;
  quizType: string;
  timeLimit: number | null;
  passingScore: number;
  isPublished: boolean;
  shuffleQuestions: boolean;
  showCorrectAnswers: boolean;
  maxAttempts: number | null;
  questions: QuestionDetail[];
  createdAt: Date;
}

export interface ResponseResult {
  questionId: string;
  questionText: string;
  questionTextAr: string | null;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string | null;
  explanationAr: string | null;
  points: number;
  earnedPoints: number;
}

export interface QuizAttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalPoints: number;
  earnedPoints: number;
  passed: boolean;
  timeSpentSeconds: number;
  showCorrectAnswers: boolean;
  responses: ResponseResult[];
}

export interface TraineeAttemptHistoryItem {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  quizTitleAr: string | null;
  score: number | null;
  passed: boolean | null;
  passingScore: number;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentSeconds: number | null;
}

export interface AdminAttemptItem {
  attemptId: string;
  traineeFirstName: string;
  traineeLastName: string;
  traineeEmail: string;
  score: number | null;
  passed: boolean | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  timeSpentSeconds: number | null;
}

// ---- Service Interface ----

export interface IQuizService {
  // Quiz management (admin/trainer)
  createQuiz(creatorId: string, orgId: string | null, data: CreateQuizInput): Promise<QuizDetail>;
  updateQuiz(quizId: string, data: UpdateQuizInput): Promise<QuizDetail>;
  deleteQuiz(quizId: string): Promise<void>;
  publishQuiz(quizId: string, publish: boolean): Promise<void>;
  getQuizForAdmin(quizId: string): Promise<QuizDetail>;
  listQuizzesForAdmin(orgId: string | null, userId: string, userRole: string): Promise<QuizListItem[]>;
  getQuizAttempts(quizId: string): Promise<AdminAttemptItem[]>;

  // Quiz taking (trainee)
  getAvailableQuizzes(courseId?: string): Promise<QuizListItem[]>;
  getQuizForTaking(quizId: string, traineeId: string): Promise<QuizDetail>;
  startAttempt(traineeId: string, quizId: string): Promise<{ attemptId: string }>;
  submitAttempt(attemptId: string, traineeId: string, responses: SubmitResponseInput[]): Promise<QuizAttemptResult>;
  getAttemptResult(attemptId: string, traineeId: string): Promise<QuizAttemptResult>;
  getTraineeHistory(traineeId: string): Promise<TraineeAttemptHistoryItem[]>;

  // AI generation
  generateQuiz(creatorId: string, orgId: string | null, input: GenerateQuizInput): Promise<QuizDetail>;
}
