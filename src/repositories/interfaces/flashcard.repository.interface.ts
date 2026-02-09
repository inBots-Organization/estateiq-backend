import { FlashcardDeck, Flashcard, CardProficiency } from '@prisma/client';

// ---- Composite Types ----
export interface DeckWithCards extends FlashcardDeck {
  cards: Flashcard[];
}

export interface DeckWithCount extends FlashcardDeck {
  _count: { cards: number };
}

export interface CardWithProficiency extends Flashcard {
  proficiencies: CardProficiency[];
}

// ---- Create DTOs ----
export interface CreateDeckData {
  courseId?: string | null;
  organizationId?: string | null;
  createdById: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  category?: string | null;
  generationType?: string;
  cardCount?: number;
}

export interface CreateCardData {
  deckId: string;
  front: string;
  frontAr?: string | null;
  back: string;
  backAr?: string | null;
  hint?: string | null;
  hintAr?: string | null;
  orderInDeck: number;
}

export interface UpsertProficiencyData {
  cardId: string;
  traineeId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  quality: number;
  nextReviewDate: Date;
  lastReviewedAt: Date;
}

// ---- Interface ----
export interface IFlashcardRepository {
  // Deck CRUD
  createDeck(data: CreateDeckData): Promise<FlashcardDeck>;
  findDeckById(id: string): Promise<FlashcardDeck | null>;
  findDeckByIdWithCards(id: string): Promise<DeckWithCards | null>;
  findPublishedDecks(courseId?: string): Promise<DeckWithCount[]>;
  findDecksByOrganization(orgId: string): Promise<DeckWithCount[]>;
  findDecksByCreator(creatorId: string): Promise<DeckWithCount[]>;
  updateDeck(id: string, data: Partial<CreateDeckData>): Promise<FlashcardDeck>;
  deleteDeck(id: string): Promise<void>;

  // Card CRUD
  createCard(data: CreateCardData): Promise<Flashcard>;
  findCardById(id: string): Promise<Flashcard | null>;
  updateCard(id: string, data: Partial<CreateCardData>): Promise<Flashcard>;
  deleteCard(id: string): Promise<void>;
  deleteCardsByDeck(deckId: string): Promise<void>;
  countCardsByDeck(deckId: string): Promise<number>;

  // Proficiency / Study
  upsertProficiency(data: UpsertProficiencyData): Promise<CardProficiency>;
  findProficiency(cardId: string, traineeId: string): Promise<CardProficiency | null>;
  findDueCards(deckId: string, traineeId: string, limit: number): Promise<CardWithProficiency[]>;
  findTraineeProgress(traineeId: string): Promise<{
    totalCards: number;
    studiedCards: number;
    masteredCards: number;
    dueToday: number;
  }>;
  findDeckProgress(deckId: string, traineeId: string): Promise<{
    totalCards: number;
    studiedCards: number;
    masteredCards: number;
    dueCards: number;
  }>;
}
