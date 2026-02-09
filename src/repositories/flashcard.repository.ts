import { injectable, inject } from 'tsyringe';
import { PrismaClient, FlashcardDeck, Flashcard, CardProficiency } from '@prisma/client';
import {
  IFlashcardRepository,
  DeckWithCards,
  DeckWithCount,
  CardWithProficiency,
  CreateDeckData,
  CreateCardData,
  UpsertProficiencyData,
} from './interfaces/flashcard.repository.interface';

@injectable()
export class FlashcardRepository implements IFlashcardRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  // ---- Deck CRUD ----

  async createDeck(data: CreateDeckData): Promise<FlashcardDeck> {
    return this.prisma.flashcardDeck.create({ data });
  }

  async findDeckById(id: string): Promise<FlashcardDeck | null> {
    return this.prisma.flashcardDeck.findUnique({ where: { id } });
  }

  async findDeckByIdWithCards(id: string): Promise<DeckWithCards | null> {
    return this.prisma.flashcardDeck.findUnique({
      where: { id },
      include: {
        cards: {
          orderBy: { orderInDeck: 'asc' },
        },
      },
    });
  }

  async findPublishedDecks(courseId?: string): Promise<DeckWithCount[]> {
    return this.prisma.flashcardDeck.findMany({
      where: {
        isPublished: true,
        ...(courseId ? { courseId } : {}),
      },
      include: {
        _count: { select: { cards: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDecksByOrganization(orgId: string): Promise<DeckWithCount[]> {
    return this.prisma.flashcardDeck.findMany({
      where: { organizationId: orgId },
      include: {
        _count: { select: { cards: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDecksByCreator(creatorId: string): Promise<DeckWithCount[]> {
    return this.prisma.flashcardDeck.findMany({
      where: { createdById: creatorId },
      include: {
        _count: { select: { cards: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateDeck(id: string, data: Partial<CreateDeckData>): Promise<FlashcardDeck> {
    return this.prisma.flashcardDeck.update({
      where: { id },
      data,
    });
  }

  async deleteDeck(id: string): Promise<void> {
    await this.prisma.flashcardDeck.delete({ where: { id } });
  }

  // ---- Card CRUD ----

  async createCard(data: CreateCardData): Promise<Flashcard> {
    return this.prisma.flashcard.create({ data });
  }

  async findCardById(id: string): Promise<Flashcard | null> {
    return this.prisma.flashcard.findUnique({ where: { id } });
  }

  async updateCard(id: string, data: Partial<CreateCardData>): Promise<Flashcard> {
    const { deckId, ...updateData } = data;
    return this.prisma.flashcard.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteCard(id: string): Promise<void> {
    await this.prisma.flashcard.delete({ where: { id } });
  }

  async deleteCardsByDeck(deckId: string): Promise<void> {
    await this.prisma.flashcard.deleteMany({ where: { deckId } });
  }

  async countCardsByDeck(deckId: string): Promise<number> {
    return this.prisma.flashcard.count({ where: { deckId } });
  }

  // ---- Proficiency / Study ----

  async upsertProficiency(data: UpsertProficiencyData): Promise<CardProficiency> {
    return this.prisma.cardProficiency.upsert({
      where: {
        cardId_traineeId: {
          cardId: data.cardId,
          traineeId: data.traineeId,
        },
      },
      create: data,
      update: {
        easeFactor: data.easeFactor,
        interval: data.interval,
        repetitions: data.repetitions,
        quality: data.quality,
        nextReviewDate: data.nextReviewDate,
        lastReviewedAt: data.lastReviewedAt,
      },
    });
  }

  async findProficiency(cardId: string, traineeId: string): Promise<CardProficiency | null> {
    return this.prisma.cardProficiency.findUnique({
      where: {
        cardId_traineeId: { cardId, traineeId },
      },
    });
  }

  async findDueCards(deckId: string, traineeId: string, limit: number): Promise<CardWithProficiency[]> {
    const now = new Date();

    // Get all cards in the deck with their proficiency for this trainee
    const cards = await this.prisma.flashcard.findMany({
      where: { deckId },
      include: {
        proficiencies: {
          where: { traineeId },
        },
      },
      orderBy: { orderInDeck: 'asc' },
    });

    // Filter to cards that are due (no proficiency = new card = due, or nextReviewDate <= now)
    const dueCards = cards.filter(card => {
      if (card.proficiencies.length === 0) return true; // New card
      return card.proficiencies[0].nextReviewDate <= now;
    });

    // Sort: new cards first, then by earliest nextReviewDate
    dueCards.sort((a, b) => {
      const aIsNew = a.proficiencies.length === 0;
      const bIsNew = b.proficiencies.length === 0;
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      if (aIsNew && bIsNew) return a.orderInDeck - b.orderInDeck;
      return a.proficiencies[0].nextReviewDate.getTime() - b.proficiencies[0].nextReviewDate.getTime();
    });

    return dueCards.slice(0, limit);
  }

  async findTraineeProgress(traineeId: string): Promise<{
    totalCards: number;
    studiedCards: number;
    masteredCards: number;
    dueToday: number;
  }> {
    const now = new Date();

    // Total cards in published decks
    const totalCards = await this.prisma.flashcard.count({
      where: {
        deck: { isPublished: true },
      },
    });

    // Cards this trainee has studied (has proficiency record)
    const studiedCards = await this.prisma.cardProficiency.count({
      where: { traineeId },
    });

    // Mastered cards (quality >= 4 and repetitions >= 3)
    const masteredCards = await this.prisma.cardProficiency.count({
      where: {
        traineeId,
        quality: { gte: 4 },
        repetitions: { gte: 3 },
      },
    });

    // Due today
    const dueToday = await this.prisma.cardProficiency.count({
      where: {
        traineeId,
        nextReviewDate: { lte: now },
      },
    });

    // Also count new cards (in published decks, no proficiency) as due
    const newCardsDue = totalCards - studiedCards;

    return {
      totalCards,
      studiedCards,
      masteredCards,
      dueToday: dueToday + Math.max(0, newCardsDue),
    };
  }

  async findDeckProgress(deckId: string, traineeId: string): Promise<{
    totalCards: number;
    studiedCards: number;
    masteredCards: number;
    dueCards: number;
  }> {
    const now = new Date();

    const totalCards = await this.prisma.flashcard.count({
      where: { deckId },
    });

    const studiedCards = await this.prisma.cardProficiency.count({
      where: {
        traineeId,
        card: { deckId },
      },
    });

    const masteredCards = await this.prisma.cardProficiency.count({
      where: {
        traineeId,
        card: { deckId },
        quality: { gte: 4 },
        repetitions: { gte: 3 },
      },
    });

    const dueReviewCards = await this.prisma.cardProficiency.count({
      where: {
        traineeId,
        card: { deckId },
        nextReviewDate: { lte: now },
      },
    });

    const newCards = totalCards - studiedCards;

    return {
      totalCards,
      studiedCards,
      masteredCards,
      dueCards: dueReviewCards + Math.max(0, newCards),
    };
  }
}
