import { z } from 'zod';

export const UpdateTraineeSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive', 'completed', 'suspended']).optional(),
});

export const EnrollProgramSchema = z.object({
  programId: z.string().uuid('Invalid program ID'),
});

export const CompleteLectureSchema = z.object({
  lectureId: z.string().min(1, 'Lecture ID is required'),
  timeSpentMinutes: z.number().min(0).max(600),
});

export const CompleteAssessmentSchema = z.object({
  assessmentId: z.string().uuid('Invalid assessment ID'),
  score: z.number().min(0).max(100),
});

export const UpdateActivitySchema = z.object({
  timeSpentMinutes: z.number().min(0).max(600),
});

export type UpdateTraineeDto = z.infer<typeof UpdateTraineeSchema>;
export type EnrollProgramDto = z.infer<typeof EnrollProgramSchema>;
export type CompleteLectureDto = z.infer<typeof CompleteLectureSchema>;
