// Type definitions for SQLite string-based enums
// These replace the Prisma enums that were used with PostgreSQL

export type TraineeStatus = 'active' | 'inactive' | 'suspended';

export type SimulationScenarioType =
  | 'property_showing'
  | 'price_negotiation'
  | 'objection_handling'
  | 'first_contact'
  | 'closing_deal'
  | 'relationship_building'
  | 'difficult_client'
  // Legacy aliases (keep for backwards compatibility)
  | 'closing'
  | 'cold_call'
  | 'follow_up';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type SimulationStatus = 'scheduled' | 'in_progress' | 'completed' | 'abandoned';

export type SimulationOutcome =
  | 'deal_closed'
  | 'follow_up_scheduled'
  | 'client_declined'
  | 'client_interested'
  | 'client_undecided'
  | 'needs_more_info'
  | 'relationship_damaged'
  | 'abandoned';

export type Sentiment = 'positive' | 'neutral' | 'negative';

export type ReportType = 'session' | 'level_summary' | 'program_completion';

export type ReportSourceType = 'ai_assessment' | 'simulation' | 'aggregated';

export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type CourseCategory =
  | 'sales'
  | 'negotiation'
  | 'communication'
  | 'product_knowledge'
  | 'market_analysis'
  | 'client_relations';

export type ObjectionCategory =
  | 'price'
  | 'timing'
  | 'competition'
  | 'need'
  | 'authority'
  | 'trust';

export type ObjectionSeverity = 'soft' | 'moderate' | 'strong';
