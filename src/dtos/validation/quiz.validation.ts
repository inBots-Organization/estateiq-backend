import { z } from 'zod';

// ---- Option Schema ----
export const CreateOptionSchema = z.object({
  optionText: z.string().min(1, 'Option text is required'),
  optionTextAr: z.string().optional().nullable(),
  isCorrect: z.boolean().default(false),
  orderInQuestion: z.number().int().min(0),
});

// ---- Question Schema ----
export const CreateQuestionSchema = z.object({
  questionText: z.string().min(1, 'Question text is required'),
  questionTextAr: z.string().optional().nullable(),
  questionType: z.enum(['multiple_choice', 'true_false']).default('multiple_choice'),
  explanation: z.string().optional().nullable(),
  explanationAr: z.string().optional().nullable(),
  points: z.number().int().min(1).default(1),
  orderInQuiz: z.number().int().min(0),
  options: z.array(CreateOptionSchema).min(2, 'At least 2 options required'),
});

// ---- Quiz Schemas ----
export const CreateQuizSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  titleAr: z.string().optional().nullable(),
  description: z.string().default(''),
  descriptionAr: z.string().optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  timeLimit: z.number().int().min(1).optional().nullable(),
  passingScore: z.number().min(0).max(100).default(70),
  shuffleQuestions: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(true),
  maxAttempts: z.number().int().min(1).optional().nullable(),
  questions: z.array(CreateQuestionSchema).min(1, 'At least 1 question required'),
});

export const UpdateQuizSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  titleAr: z.string().optional().nullable(),
  description: z.string().optional(),
  descriptionAr: z.string().optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  timeLimit: z.number().int().min(1).optional().nullable(),
  passingScore: z.number().min(0).max(100).optional(),
  shuffleQuestions: z.boolean().optional(),
  showCorrectAnswers: z.boolean().optional(),
  maxAttempts: z.number().int().min(1).optional().nullable(),
  questions: z.array(CreateQuestionSchema).min(1).optional(),
});

export const PublishQuizSchema = z.object({
  publish: z.boolean(),
});

// ---- Attempt Schemas ----
export const SubmitResponseSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().optional().nullable(),
});

export const SubmitAttemptSchema = z.object({
  responses: z.array(SubmitResponseSchema).min(1, 'At least 1 response required'),
});

// ---- AI Generation Schema ----
export const GenerateQuizSchema = z.object({
  courseId: z.string().uuid().optional(),
  topic: z.string().optional(),
  numberOfQuestions: z.number().int().min(3).max(30).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  questionTypes: z.array(z.enum(['multiple_choice', 'true_false'])).default(['multiple_choice']),
});

// ---- Inferred Types ----
export type CreateQuizInput = z.infer<typeof CreateQuizSchema>;
export type UpdateQuizInput = z.infer<typeof UpdateQuizSchema>;
export type CreateQuestionInput = z.infer<typeof CreateQuestionSchema>;
export type CreateOptionInput = z.infer<typeof CreateOptionSchema>;
export type SubmitAttemptInput = z.infer<typeof SubmitAttemptSchema>;
export type SubmitResponseInput = z.infer<typeof SubmitResponseSchema>;
export type GenerateQuizInput = z.infer<typeof GenerateQuizSchema>;
