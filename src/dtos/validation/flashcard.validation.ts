import { z } from 'zod';

// ---- Card Schema ----
export const CreateCardSchema = z.object({
  front: z.string().min(1, 'Front text is required'),
  frontAr: z.string().optional().nullable(),
  back: z.string().min(1, 'Back text is required'),
  backAr: z.string().optional().nullable(),
  hint: z.string().optional().nullable(),
  hintAr: z.string().optional().nullable(),
  orderInDeck: z.number().int().min(0).default(0),
});

export const UpdateCardSchema = z.object({
  front: z.string().min(1).optional(),
  frontAr: z.string().optional().nullable(),
  back: z.string().min(1).optional(),
  backAr: z.string().optional().nullable(),
  hint: z.string().optional().nullable(),
  hintAr: z.string().optional().nullable(),
  orderInDeck: z.number().int().min(0).optional(),
});

// ---- Deck Schemas ----
export const CreateDeckSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  titleAr: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionAr: z.string().optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  category: z.string().optional().nullable(),
  cards: z.array(CreateCardSchema).min(1, 'At least 1 card required'),
});

export const UpdateDeckSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  titleAr: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionAr: z.string().optional().nullable(),
  courseId: z.string().uuid().optional().nullable(),
  category: z.string().optional().nullable(),
});

export const PublishDeckSchema = z.object({
  publish: z.boolean(),
});

// ---- Review Schema ----
export const SubmitReviewSchema = z.object({
  quality: z.number().int().min(0).max(5),
});

// ---- AI Generation Schema ----
export const GenerateDeckSchema = z.object({
  courseId: z.string().uuid().optional(),
  topic: z.string().optional(),
  numberOfCards: z.number().int().min(3).max(50).default(10),
});

// ---- Inferred Types ----
export type CreateDeckInput = z.infer<typeof CreateDeckSchema>;
export type UpdateDeckInput = z.infer<typeof UpdateDeckSchema>;
export type CreateCardInput = z.infer<typeof CreateCardSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;
export type SubmitReviewInput = z.infer<typeof SubmitReviewSchema>;
export type GenerateDeckInput = z.infer<typeof GenerateDeckSchema>;
