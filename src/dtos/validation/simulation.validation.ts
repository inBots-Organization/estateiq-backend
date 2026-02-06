import { z } from 'zod';

export const StartSimulationInputSchema = z.object({
  scenarioType: z.enum([
    'property_showing',
    'price_negotiation',
    'objection_handling',
    'first_contact',
    'closing_deal',
    'relationship_building',
    'difficult_client',
  ]),
  difficultyLevel: z.enum(['easy', 'medium', 'hard']),
  recordSession: z.boolean().default(false),
  customPersonaConfig: z.object({
    name: z.string().optional(),
    background: z.string().optional(),
    personality: z.enum(['friendly', 'skeptical', 'demanding', 'indecisive', 'analytical']).optional(),
    budget: z.string().optional(),
    motivations: z.array(z.string()).optional(),
    objections: z.array(z.string()).optional(),
    hiddenConcerns: z.array(z.string()).optional(),
  }).optional(),
});

export const SimulationMessageInputSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long'),
  messageType: z.enum(['text', 'voice_transcript']).default('text'),
});

export const EndSimulationInputSchema = z.object({
  endReason: z.enum(['completed', 'abandoned', 'timeout', 'error']).default('completed'),
});

export const AnalyzeSimulationQuerySchema = z.object({
  includeDetailedTranscriptAnalysis: z.enum(['true', 'false']).default('false'),
  compareToHistory: z.enum(['true', 'false']).default('false'),
});

export type StartSimulationInputDto = z.infer<typeof StartSimulationInputSchema>;
export type SimulationMessageInputDto = z.infer<typeof SimulationMessageInputSchema>;
export type EndSimulationInputDto = z.infer<typeof EndSimulationInputSchema>;
