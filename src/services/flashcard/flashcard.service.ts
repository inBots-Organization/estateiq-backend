import { injectable, inject } from 'tsyringe';
import {
  IFlashcardService,
  DeckDetail,
  DeckListItem,
  DeckListItemWithProgress,
  CardDetail,
  StudyCard,
  ReviewResult,
  FlashcardProgress,
} from '../interfaces/flashcard.interface';
import {
  IFlashcardRepository,
  DeckWithCards,
  DeckWithCount,
} from '../../repositories/interfaces/flashcard.repository.interface';
import {
  CreateDeckInput,
  UpdateDeckInput,
  CreateCardInput,
  UpdateCardInput,
  GenerateDeckInput,
} from '../../dtos/validation/flashcard.validation';
import { calculateSM2, getMasteryLevel } from './sm2';

@injectable()
export class FlashcardService implements IFlashcardService {
  constructor(
    @inject('FlashcardRepository') private flashcardRepo: IFlashcardRepository
  ) {}

  // ==========================================
  // Deck Management (Admin/Trainer)
  // ==========================================

  async createDeck(creatorId: string, orgId: string | null, data: CreateDeckInput): Promise<DeckDetail> {
    // Create the deck record
    const deck = await this.flashcardRepo.createDeck({
      createdById: creatorId,
      organizationId: orgId,
      courseId: data.courseId || null,
      title: data.title,
      titleAr: data.titleAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      category: data.category,
      generationType: 'manual',
      cardCount: data.cards.length,
    });

    // Create cards
    for (const cardInput of data.cards) {
      await this.flashcardRepo.createCard({
        deckId: deck.id,
        front: cardInput.front,
        frontAr: cardInput.frontAr,
        back: cardInput.back,
        backAr: cardInput.backAr,
        hint: cardInput.hint,
        hintAr: cardInput.hintAr,
        orderInDeck: cardInput.orderInDeck,
      });
    }

    return this.getDeckForAdmin(deck.id);
  }

  async updateDeck(deckId: string, data: UpdateDeckInput): Promise<DeckDetail> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');

    await this.flashcardRepo.updateDeck(deckId, {
      title: data.title ?? existing.title,
      titleAr: data.titleAr !== undefined ? data.titleAr : existing.titleAr,
      description: data.description !== undefined ? data.description : existing.description,
      descriptionAr: data.descriptionAr !== undefined ? data.descriptionAr : existing.descriptionAr,
      courseId: data.courseId !== undefined ? data.courseId : existing.courseId,
      category: data.category !== undefined ? data.category : existing.category,
    });

    return this.getDeckForAdmin(deckId);
  }

  async deleteDeck(deckId: string): Promise<void> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');
    await this.flashcardRepo.deleteDeck(deckId);
  }

  async publishDeck(deckId: string, publish: boolean): Promise<void> {
    const existing = await this.flashcardRepo.findDeckById(deckId);
    if (!existing) throw new Error('Deck not found');

    if (publish) {
      const cardCount = await this.flashcardRepo.countCardsByDeck(deckId);
      if (cardCount === 0) {
        throw new Error('Cannot publish deck with no cards');
      }
    }

    await this.flashcardRepo.updateDeck(deckId, { isPublished: publish } as any);
  }

  async getDeckForAdmin(deckId: string): Promise<DeckDetail> {
    const deck = await this.flashcardRepo.findDeckByIdWithCards(deckId);
    if (!deck) throw new Error('Deck not found');
    return this.mapDeckToDetail(deck);
  }

  async listDecksForAdmin(orgId: string | null, userId: string, userRole: string): Promise<DeckListItem[]> {
    let decks: DeckWithCount[];

    if (orgId) {
      decks = await this.flashcardRepo.findDecksByOrganization(orgId);
    } else {
      decks = await this.flashcardRepo.findDecksByCreator(userId);
    }

    return decks.map(d => this.mapDeckToListItem(d));
  }

  // ==========================================
  // Card Management (Admin/Trainer)
  // ==========================================

  async addCardToDeck(deckId: string, data: CreateCardInput): Promise<CardDetail> {
    const deck = await this.flashcardRepo.findDeckById(deckId);
    if (!deck) throw new Error('Deck not found');

    const card = await this.flashcardRepo.createCard({
      deckId,
      front: data.front,
      frontAr: data.frontAr,
      back: data.back,
      backAr: data.backAr,
      hint: data.hint,
      hintAr: data.hintAr,
      orderInDeck: data.orderInDeck,
    });

    // Update card count
    const count = await this.flashcardRepo.countCardsByDeck(deckId);
    await this.flashcardRepo.updateDeck(deckId, { cardCount: count } as any);

    return {
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: card.orderInDeck,
    };
  }

  async updateCard(cardId: string, data: UpdateCardInput): Promise<CardDetail> {
    const existing = await this.flashcardRepo.findCardById(cardId);
    if (!existing) throw new Error('Card not found');

    const card = await this.flashcardRepo.updateCard(cardId, {
      front: data.front ?? existing.front,
      frontAr: data.frontAr !== undefined ? data.frontAr : existing.frontAr,
      back: data.back ?? existing.back,
      backAr: data.backAr !== undefined ? data.backAr : existing.backAr,
      hint: data.hint !== undefined ? data.hint : existing.hint,
      hintAr: data.hintAr !== undefined ? data.hintAr : existing.hintAr,
      orderInDeck: data.orderInDeck ?? existing.orderInDeck,
    });

    return {
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: card.orderInDeck,
    };
  }

  async deleteCard(cardId: string): Promise<void> {
    const existing = await this.flashcardRepo.findCardById(cardId);
    if (!existing) throw new Error('Card not found');

    await this.flashcardRepo.deleteCard(cardId);

    // Update card count
    const count = await this.flashcardRepo.countCardsByDeck(existing.deckId);
    await this.flashcardRepo.updateDeck(existing.deckId, { cardCount: count } as any);
  }

  // ==========================================
  // Study (Trainee)
  // ==========================================

  async getAvailableDecks(traineeId: string, courseId?: string): Promise<DeckListItemWithProgress[]> {
    const decks = await this.flashcardRepo.findPublishedDecks(courseId);

    const result: DeckListItemWithProgress[] = [];
    for (const deck of decks) {
      const progress = await this.flashcardRepo.findDeckProgress(deck.id, traineeId);
      result.push({
        ...this.mapDeckToListItem(deck),
        progress,
      });
    }

    return result;
  }

  async getStudyCards(deckId: string, traineeId: string): Promise<StudyCard[]> {
    const deck = await this.flashcardRepo.findDeckById(deckId);
    if (!deck) throw new Error('Deck not found');
    if (!deck.isPublished) throw new Error('Deck is not available');

    const dueCards = await this.flashcardRepo.findDueCards(deckId, traineeId, 20);

    return dueCards.map(card => ({
      id: card.id,
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      proficiency: card.proficiencies.length > 0
        ? {
            easeFactor: card.proficiencies[0].easeFactor,
            interval: card.proficiencies[0].interval,
            repetitions: card.proficiencies[0].repetitions,
            quality: card.proficiencies[0].quality,
            lastReviewedAt: card.proficiencies[0].lastReviewedAt,
          }
        : null,
    }));
  }

  async submitReview(cardId: string, traineeId: string, quality: number): Promise<ReviewResult> {
    const card = await this.flashcardRepo.findCardById(cardId);
    if (!card) throw new Error('Card not found');

    // Get existing proficiency or use defaults
    const existing = await this.flashcardRepo.findProficiency(cardId, traineeId);

    const sm2Result = calculateSM2({
      quality,
      easeFactor: existing?.easeFactor ?? 2.5,
      interval: existing?.interval ?? 0,
      repetitions: existing?.repetitions ?? 0,
    });

    // Upsert proficiency
    await this.flashcardRepo.upsertProficiency({
      cardId,
      traineeId,
      easeFactor: sm2Result.easeFactor,
      interval: sm2Result.interval,
      repetitions: sm2Result.repetitions,
      quality,
      nextReviewDate: sm2Result.nextReviewDate,
      lastReviewedAt: new Date(),
    });

    return {
      cardId,
      newEaseFactor: sm2Result.easeFactor,
      newInterval: sm2Result.interval,
      newRepetitions: sm2Result.repetitions,
      nextReviewDate: sm2Result.nextReviewDate,
      masteryLevel: getMasteryLevel(sm2Result.repetitions, sm2Result.easeFactor),
    };
  }

  async getProgress(traineeId: string): Promise<FlashcardProgress> {
    return this.flashcardRepo.findTraineeProgress(traineeId);
  }

  // ==========================================
  // AI Generation (Mock Fallback)
  // ==========================================

  async generateDeck(creatorId: string, orgId: string | null, input: GenerateDeckInput): Promise<DeckDetail> {
    const topic = input.topic || 'Real Estate Fundamentals';
    const numCards = input.numberOfCards || 10;

    const sampleCards = this.generateSampleCards(topic, numCards);

    const deckData: CreateDeckInput = {
      title: `AI Generated: ${topic}`,
      titleAr: `\u0625\u0646\u0634\u0627\u0621 \u062A\u0644\u0642\u0627\u0626\u064A: ${topic}`,
      description: `Auto-generated flashcard deck about ${topic}`,
      descriptionAr: `\u0645\u062C\u0645\u0648\u0639\u0629 \u0628\u0637\u0627\u0642\u0627\u062A \u062A\u0639\u0644\u064A\u0645\u064A\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u062D\u0648\u0644 ${topic}`,
      courseId: input.courseId || null,
      category: 'ai_generated',
      cards: sampleCards,
    };

    const deck = await this.createDeck(creatorId, orgId, deckData);

    // Mark as AI generated AND auto-publish for immediate use
    await this.flashcardRepo.updateDeck(deck.id, {
      generationType: 'ai_generated',
      isPublished: true,
    } as any);

    return { ...deck, generationType: 'ai_generated', isPublished: true };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private mapDeckToDetail(deck: DeckWithCards): DeckDetail {
    return {
      id: deck.id,
      title: deck.title,
      titleAr: deck.titleAr,
      description: deck.description,
      descriptionAr: deck.descriptionAr,
      courseId: deck.courseId,
      category: deck.category,
      isPublished: deck.isPublished,
      generationType: deck.generationType,
      cardCount: deck.cards.length,
      createdAt: deck.createdAt,
      cards: deck.cards.map(c => ({
        id: c.id,
        front: c.front,
        frontAr: c.frontAr,
        back: c.back,
        backAr: c.backAr,
        hint: c.hint,
        hintAr: c.hintAr,
        orderInDeck: c.orderInDeck,
      })),
    };
  }

  private mapDeckToListItem(deck: DeckWithCount): DeckListItem {
    return {
      id: deck.id,
      title: deck.title,
      titleAr: deck.titleAr,
      description: deck.description,
      descriptionAr: deck.descriptionAr,
      courseId: deck.courseId,
      category: deck.category,
      isPublished: deck.isPublished,
      generationType: deck.generationType,
      cardCount: deck._count.cards,
      createdAt: deck.createdAt,
    };
  }

  private generateSampleCards(topic: string, count: number) {
    const samplePool = [
      {
        front: 'What is a Comparative Market Analysis (CMA)?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0642\u0627\u0631\u0646?',
        back: 'A CMA is an evaluation of similar properties in the same area to determine a competitive listing or purchase price.',
        backAr: '\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0642\u0627\u0631\u0646 \u0647\u0648 \u062A\u0642\u064A\u064A\u0645 \u0644\u0644\u0639\u0642\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0645\u0627\u062B\u0644\u0629 \u0641\u064A \u0646\u0641\u0633 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0644\u062A\u062D\u062F\u064A\u062F \u0633\u0639\u0631 \u062A\u0646\u0627\u0641\u0633\u064A.',
        hint: 'Think: comparing similar homes sold recently',
        hintAr: '\u0641\u0643\u0631: \u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0645\u0646\u0627\u0632\u0644 \u0627\u0644\u0645\u0645\u0627\u062B\u0644\u0629 \u0627\u0644\u0645\u0628\u0627\u0639\u0629 \u0645\u0624\u062E\u0631\u0627\u064B',
      },
      {
        front: 'What does ROI stand for in real estate?',
        frontAr: '\u0645\u0627\u0630\u0627 \u064A\u0639\u0646\u064A ROI \u0641\u064A \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A\u061F',
        back: 'Return on Investment - the ratio of net profit to total investment cost, expressed as a percentage.',
        backAr: '\u0627\u0644\u0639\u0627\u0626\u062F \u0639\u0644\u0649 \u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631 - \u0646\u0633\u0628\u0629 \u0635\u0627\u0641\u064A \u0627\u0644\u0631\u0628\u062D \u0625\u0644\u0649 \u0625\u062C\u0645\u0627\u0644\u064A \u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0627\u0633\u062A\u062B\u0645\u0627\u0631.',
        hint: 'Profit / Cost x 100',
        hintAr: '\u0627\u0644\u0631\u0628\u062D / \u0627\u0644\u062A\u0643\u0644\u0641\u0629 x 100',
      },
      {
        front: 'What is a property deed?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u0635\u0643 \u0627\u0644\u0645\u0644\u0643\u064A\u0629\u061F',
        back: 'A legal document that transfers ownership of real property from one party to another.',
        backAr: '\u0648\u062B\u064A\u0642\u0629 \u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u062A\u0646\u0642\u0644 \u0645\u0644\u0643\u064A\u0629 \u0627\u0644\u0639\u0642\u0627\u0631 \u0645\u0646 \u0637\u0631\u0641 \u0625\u0644\u0649 \u0622\u062E\u0631.',
        hint: 'The official ownership transfer document',
        hintAr: '\u0648\u062B\u064A\u0642\u0629 \u0646\u0642\u0644 \u0627\u0644\u0645\u0644\u0643\u064A\u0629 \u0627\u0644\u0631\u0633\u0645\u064A\u0629',
      },
      {
        front: 'What is the difference between a listing agent and a buyer\'s agent?',
        frontAr: '\u0645\u0627 \u0627\u0644\u0641\u0631\u0642 \u0628\u064A\u0646 \u0648\u0643\u064A\u0644 \u0627\u0644\u0628\u0627\u0626\u0639 \u0648\u0648\u0643\u064A\u0644 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u061F',
        back: 'A listing agent represents the seller and markets the property. A buyer\'s agent represents the buyer and helps find and negotiate purchases.',
        backAr: '\u0648\u0643\u064A\u0644 \u0627\u0644\u0628\u0627\u0626\u0639 \u064A\u0645\u062B\u0644 \u0627\u0644\u0628\u0627\u0626\u0639 \u0648\u064A\u0633\u0648\u0642 \u0627\u0644\u0639\u0642\u0627\u0631. \u0648\u0643\u064A\u0644 \u0627\u0644\u0645\u0634\u062A\u0631\u064A \u064A\u0645\u062B\u0644 \u0627\u0644\u0645\u0634\u062A\u0631\u064A \u0648\u064A\u0633\u0627\u0639\u062F \u0641\u064A \u0627\u0644\u0628\u062D\u062B \u0648\u0627\u0644\u062A\u0641\u0627\u0648\u0636.',
        hint: 'One sells, one buys',
        hintAr: '\u0648\u0627\u062D\u062F \u064A\u0628\u064A\u0639\u060C \u0648\u0627\u062D\u062F \u064A\u0634\u062A\u0631\u064A',
      },
      {
        front: 'What is an escrow account?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u062D\u0633\u0627\u0628 \u0627\u0644\u0636\u0645\u0627\u0646\u061F',
        back: 'A third-party account where funds are held during a real estate transaction until all conditions are met.',
        backAr: '\u062D\u0633\u0627\u0628 \u0644\u062F\u0649 \u0637\u0631\u0641 \u062B\u0627\u0644\u062B \u062A\u064F\u062D\u0641\u0638 \u0641\u064A\u0647 \u0627\u0644\u0623\u0645\u0648\u0627\u0644 \u062D\u062A\u0649 \u0627\u0633\u062A\u064A\u0641\u0627\u0621 \u062C\u0645\u064A\u0639 \u0627\u0644\u0634\u0631\u0648\u0637.',
        hint: 'Neutral party holds the money',
        hintAr: '\u0637\u0631\u0641 \u0645\u062D\u0627\u064A\u062F \u064A\u062D\u062A\u0641\u0638 \u0628\u0627\u0644\u0623\u0645\u0648\u0627\u0644',
      },
      {
        front: 'What is property appraisal?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0639\u0642\u0627\u0631\u061F',
        back: 'A professional assessment of a property\'s market value conducted by a licensed appraiser.',
        backAr: '\u062A\u0642\u064A\u064A\u0645 \u0645\u0647\u0646\u064A \u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0639\u0642\u0627\u0631 \u0627\u0644\u0633\u0648\u0642\u064A\u0629 \u064A\u0642\u0648\u0645 \u0628\u0647 \u0645\u0642\u064A\u0645 \u0645\u0631\u062E\u0635.',
        hint: 'Expert determines fair market value',
        hintAr: '\u062E\u0628\u064A\u0631 \u064A\u062D\u062F\u062F \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0633\u0648\u0642\u064A\u0629 \u0627\u0644\u0639\u0627\u062F\u0644\u0629',
      },
      {
        front: 'What is due diligence in real estate?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u0627\u0644\u0639\u0646\u0627\u064A\u0629 \u0627\u0644\u0648\u0627\u062C\u0628\u0629 \u0641\u064A \u0627\u0644\u0639\u0642\u0627\u0631\u0627\u062A\u061F',
        back: 'The investigation and research a buyer performs before completing a property purchase, including inspections, title search, and financial analysis.',
        backAr: '\u0627\u0644\u062A\u062D\u0642\u064A\u0642 \u0648\u0627\u0644\u0628\u062D\u062B \u0627\u0644\u0630\u064A \u064A\u0642\u0648\u0645 \u0628\u0647 \u0627\u0644\u0645\u0634\u062A\u0631\u064A \u0642\u0628\u0644 \u0625\u062A\u0645\u0627\u0645 \u0627\u0644\u0634\u0631\u0627\u0621.',
        hint: 'Research before buying',
        hintAr: '\u0627\u0644\u0628\u062D\u062B \u0642\u0628\u0644 \u0627\u0644\u0634\u0631\u0627\u0621',
      },
      {
        front: 'What is a mortgage?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u0627\u0644\u0631\u0647\u0646 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u061F',
        back: 'A loan from a financial institution to purchase property, using the property itself as collateral.',
        backAr: '\u0642\u0631\u0636 \u0645\u0646 \u0645\u0624\u0633\u0633\u0629 \u0645\u0627\u0644\u064A\u0629 \u0644\u0634\u0631\u0627\u0621 \u0639\u0642\u0627\u0631\u060C \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0639\u0642\u0627\u0631 \u0646\u0641\u0633\u0647 \u0643\u0636\u0645\u0627\u0646.',
        hint: 'Loan secured by property',
        hintAr: '\u0642\u0631\u0636 \u0645\u0636\u0645\u0648\u0646 \u0628\u0627\u0644\u0639\u0642\u0627\u0631',
      },
      {
        front: 'What is the closing process?',
        frontAr: '\u0645\u0627 \u0647\u064A \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0625\u063A\u0644\u0627\u0642\u061F',
        back: 'The final step in a real estate transaction where documents are signed, funds are transferred, and ownership is officially transferred.',
        backAr: '\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629 \u0641\u064A \u0627\u0644\u0635\u0641\u0642\u0629 \u0627\u0644\u0639\u0642\u0627\u0631\u064A\u0629 \u062D\u064A\u062B \u064A\u062A\u0645 \u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0645\u0633\u062A\u0646\u062F\u0627\u062A \u0648\u0646\u0642\u0644 \u0627\u0644\u0623\u0645\u0648\u0627\u0644 \u0648\u0627\u0644\u0645\u0644\u0643\u064A\u0629.',
        hint: 'Final transaction step',
        hintAr: '\u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u0623\u062E\u064A\u0631\u0629 \u0641\u064A \u0627\u0644\u0635\u0641\u0642\u0629',
      },
      {
        front: 'What is property zoning?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u062A\u0646\u0638\u064A\u0645 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u0631\u0627\u0636\u064A\u061F',
        back: 'Government regulations that designate how land in specific areas can be used (residential, commercial, industrial, etc.).',
        backAr: '\u0644\u0648\u0627\u0626\u062D \u062D\u0643\u0648\u0645\u064A\u0629 \u062A\u062D\u062F\u062F \u0643\u064A\u0641\u064A\u0629 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u0631\u0636 \u0641\u064A \u0645\u0646\u0627\u0637\u0642 \u0645\u062D\u062F\u062F\u0629.',
        hint: 'Land use rules by government',
        hintAr: '\u0642\u0648\u0627\u0639\u062F \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0623\u0631\u0627\u0636\u064A',
      },
      {
        front: 'What is a title search?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0627\u0644\u0633\u0646\u062F\u061F',
        back: 'An examination of public records to verify the legal ownership of a property and identify any claims or liens.',
        backAr: '\u0641\u062D\u0635 \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629 \u0644\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0644\u0643\u064A\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A\u0629 \u0648\u062A\u062D\u062F\u064A\u062F \u0623\u064A \u0645\u0637\u0627\u0644\u0628\u0627\u062A.',
        hint: 'Checking ownership history',
        hintAr: '\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u0644\u0643\u064A\u0629',
      },
      {
        front: 'What is earnest money?',
        frontAr: '\u0645\u0627 \u0647\u0648 \u0627\u0644\u0639\u0631\u0628\u0648\u0646\u061F',
        back: 'A deposit made by a buyer to demonstrate serious intent to purchase, typically held in escrow until closing.',
        backAr: '\u0648\u062F\u064A\u0639\u0629 \u064A\u0642\u062F\u0645\u0647\u0627 \u0627\u0644\u0645\u0634\u062A\u0631\u064A \u0644\u0625\u0638\u0647\u0627\u0631 \u062C\u062F\u064A\u0629 \u0646\u064A\u0629 \u0627\u0644\u0634\u0631\u0627\u0621.',
        hint: 'Good faith deposit',
        hintAr: '\u0648\u062F\u064A\u0639\u0629 \u062D\u0633\u0646 \u0627\u0644\u0646\u064A\u0629',
      },
    ];

    const selected = samplePool.slice(0, Math.min(count, samplePool.length));

    return selected.map((card, index) => ({
      front: card.front,
      frontAr: card.frontAr,
      back: card.back,
      backAr: card.backAr,
      hint: card.hint,
      hintAr: card.hintAr,
      orderInDeck: index,
    }));
  }
}
