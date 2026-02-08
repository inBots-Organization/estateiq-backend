import { Quiz, Question, QuestionOption, QuizAttempt, QuizResponse } from '@prisma/client';

// ---- Composite Types ----
export interface QuizWithQuestions extends Quiz {
  questions: (Question & { options: QuestionOption[] })[];
}

export interface QuizWithCount extends Quiz {
  _count: { questions: number; attempts: number };
}

export interface AttemptWithTrainee extends QuizAttempt {
  trainee: { firstName: string; lastName: string; email: string };
}

export interface AttemptWithResponses extends QuizAttempt {
  responses: (QuizResponse & {
    question: Question & { options: QuestionOption[] };
  })[];
}

// ---- Create DTOs ----
export interface CreateQuizData {
  courseId?: string | null;
  organizationId?: string | null;
  createdById: string;
  title: string;
  titleAr?: string | null;
  description?: string;
  descriptionAr?: string | null;
  quizType?: string;
  difficulty?: string;
  timeLimit?: number | null;
  passingScore?: number;
  shuffleQuestions?: boolean;
  showCorrectAnswers?: boolean;
  maxAttempts?: number | null;
}

export interface CreateQuestionData {
  quizId: string;
  questionText: string;
  questionTextAr?: string | null;
  questionType?: string;
  explanation?: string | null;
  explanationAr?: string | null;
  points?: number;
  orderInQuiz: number;
}

export interface CreateOptionData {
  questionId: string;
  optionText: string;
  optionTextAr?: string | null;
  isCorrect?: boolean;
  orderInQuestion: number;
}

export interface CreateAttemptData {
  quizId: string;
  traineeId: string;
}

export interface CreateResponseData {
  attemptId: string;
  questionId: string;
  selectedOptionId?: string | null;
  isCorrect: boolean;
}

// ---- Interface ----
export interface IQuizRepository {
  // Quiz CRUD
  create(data: CreateQuizData): Promise<Quiz>;
  findById(id: string): Promise<Quiz | null>;
  findByIdWithQuestions(id: string): Promise<QuizWithQuestions | null>;
  findByCourse(courseId: string, publishedOnly?: boolean): Promise<QuizWithCount[]>;
  findByOrganization(orgId: string): Promise<QuizWithCount[]>;
  findByCreator(creatorId: string): Promise<QuizWithCount[]>;
  findPublished(courseId?: string): Promise<QuizWithCount[]>;
  update(id: string, data: Partial<CreateQuizData>): Promise<Quiz>;
  delete(id: string): Promise<void>;

  // Questions
  createQuestion(data: CreateQuestionData): Promise<Question>;
  deleteQuestionsByQuiz(quizId: string): Promise<void>;

  // Options
  createOption(data: CreateOptionData): Promise<QuestionOption>;

  // Attempts
  createAttempt(data: CreateAttemptData): Promise<QuizAttempt>;
  findAttemptById(id: string): Promise<QuizAttempt | null>;
  findAttemptByIdWithResponses(id: string): Promise<AttemptWithResponses | null>;
  findAttemptsByTrainee(traineeId: string, quizId?: string): Promise<(QuizAttempt & { quiz: { title: string; titleAr: string | null; passingScore: number } })[]>;
  findAttemptsByQuiz(quizId: string): Promise<AttemptWithTrainee[]>;
  updateAttempt(id: string, data: Partial<QuizAttempt>): Promise<QuizAttempt>;
  countAttemptsByTraineeAndQuiz(traineeId: string, quizId: string): Promise<number>;

  // Responses
  createManyResponses(data: CreateResponseData[]): Promise<number>;
  findResponsesByAttempt(attemptId: string): Promise<(QuizResponse & { question: Question & { options: QuestionOption[] } })[]>;
}
