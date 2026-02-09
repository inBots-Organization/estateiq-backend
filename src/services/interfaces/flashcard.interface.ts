import { CreateDeckInput, UpdateDeckInput, CreateCardInput, UpdateCardInput, GenerateDeckInput } from '../../dtos/validation/flashcard.validation';

// ---- Response DTOs ----

export interface CardDetail {
  id: string;
  front: string;
  frontAr: string | null;
  back: string;
  backAr: string | null;
  hint: string | null;
  hintAr: string | null;
  orderInDeck: number;
}

export interface DeckDetail {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  courseId: string | null;
  category: string | null;
  isPublished: boolean;
  generationType: string;
  cardCount: number;
  cards: CardDetail[];
  createdAt: Date;
}

export interface DeckListItem {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  courseId: string | null;
  category: string | null;
  isPublished: boolean;
  generationType: string;
  cardCount: number;
  createdAt: Date;
}

export interface DeckListItemWithProgress extends DeckListItem {
  progress: {
    totalCards: number;
    studiedCards: number;
    masteredCards: number;
    dueCards: number;
  };
}

export interface StudyCard {
  id: string;
  front: string;
  frontAr: string | null;
  back: string;
  backAr: string | null;
  hint: string | null;
  hintAr: string | null;
  proficiency: {
    easeFactor: number;
    interval: number;
    repetitions: number;
    quality: number;
    lastReviewedAt: Date | null;
  } | null;
}

export interface ReviewResult {
  cardId: string;
  newEaseFactor: number;
  newInterval: number;
  newRepetitions: number;
  nextReviewDate: Date;
  masteryLevel: string;
}

export interface FlashcardProgress {
  totalCards: number;
  studiedCards: number;
  masteredCards: number;
  dueToday: number;
}

// ---- Service Interface ----

export interface IFlashcardService {
  // Deck management (admin/trainer)
  createDeck(creatorId: string, orgId: string | null, data: CreateDeckInput): Promise<DeckDetail>;
  updateDeck(deckId: string, data: UpdateDeckInput): Promise<DeckDetail>;
  deleteDeck(deckId: string): Promise<void>;
  publishDeck(deckId: string, publish: boolean): Promise<void>;
  getDeckForAdmin(deckId: string): Promise<DeckDetail>;
  listDecksForAdmin(orgId: string | null, userId: string, userRole: string): Promise<DeckListItem[]>;

  // Card management (admin/trainer)
  addCardToDeck(deckId: string, data: CreateCardInput): Promise<CardDetail>;
  updateCard(cardId: string, data: UpdateCardInput): Promise<CardDetail>;
  deleteCard(cardId: string): Promise<void>;

  // Study (trainee)
  getAvailableDecks(traineeId: string, courseId?: string): Promise<DeckListItemWithProgress[]>;
  getStudyCards(deckId: string, traineeId: string): Promise<StudyCard[]>;
  submitReview(cardId: string, traineeId: string, quality: number): Promise<ReviewResult>;
  getProgress(traineeId: string): Promise<FlashcardProgress>;

  // AI generation
  generateDeck(creatorId: string, orgId: string | null, input: GenerateDeckInput): Promise<DeckDetail>;
}
