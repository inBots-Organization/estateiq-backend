import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import { IFlashcardService } from '../services/interfaces/flashcard.interface';
import { validateRequest } from '../middleware/validation.middleware';
import {
  CreateDeckSchema,
  UpdateDeckSchema,
  PublishDeckSchema,
  CreateCardSchema,
  UpdateCardSchema,
  SubmitReviewSchema,
  GenerateDeckSchema,
} from '../dtos/validation/flashcard.validation';
import { authMiddleware } from '../middleware/auth.middleware';

@injectable()
export class FlashcardController {
  public router: Router;

  constructor(
    @inject('FlashcardService') private flashcardService: IFlashcardService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // ==========================================
    // Trainee routes (must come before :deckId)
    // ==========================================

    // GET /api/flashcards/decks/available — List published decks with progress
    this.router.get(
      '/decks/available',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getAvailableDecks.bind(this)
    );

    // GET /api/flashcards/progress — Overall flashcard progress
    this.router.get(
      '/progress',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getProgress.bind(this)
    );

    // POST /api/flashcards/cards/:cardId/review — Submit quality rating
    this.router.post(
      '/cards/:cardId/review',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      validateRequest(SubmitReviewSchema),
      this.submitReview.bind(this)
    );

    // ==========================================
    // Admin routes (must come before :deckId)
    // ==========================================

    // GET /api/flashcards/decks/manage — List all decks (admin view)
    this.router.get(
      '/decks/manage',
      authMiddleware(['trainer', 'org_admin']),
      this.listDecksForAdmin.bind(this)
    );

    // POST /api/flashcards/decks/generate — AI-generate deck
    this.router.post(
      '/decks/generate',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(GenerateDeckSchema),
      this.generateDeck.bind(this)
    );

    // POST /api/flashcards/decks — Create deck with cards
    this.router.post(
      '/decks',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(CreateDeckSchema),
      this.createDeck.bind(this)
    );

    // ==========================================
    // Parameterized :deckId routes
    // ==========================================

    // GET /api/flashcards/decks/:deckId/study — Get due cards for study session
    this.router.get(
      '/decks/:deckId/study',
      authMiddleware(['trainee', 'trainer', 'org_admin']),
      this.getStudyCards.bind(this)
    );

    // GET /api/flashcards/decks/:deckId/admin — Full deck detail with all cards
    this.router.get(
      '/decks/:deckId/admin',
      authMiddleware(['trainer', 'org_admin']),
      this.getDeckForAdmin.bind(this)
    );

    // POST /api/flashcards/decks/:deckId/cards — Add card to existing deck
    this.router.post(
      '/decks/:deckId/cards',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(CreateCardSchema),
      this.addCardToDeck.bind(this)
    );

    // PATCH /api/flashcards/decks/:deckId/publish — Toggle publish status
    this.router.patch(
      '/decks/:deckId/publish',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(PublishDeckSchema),
      this.publishDeck.bind(this)
    );

    // PUT /api/flashcards/decks/:deckId — Update deck metadata
    this.router.put(
      '/decks/:deckId',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(UpdateDeckSchema),
      this.updateDeck.bind(this)
    );

    // DELETE /api/flashcards/decks/:deckId — Delete deck
    this.router.delete(
      '/decks/:deckId',
      authMiddleware(['trainer', 'org_admin']),
      this.deleteDeck.bind(this)
    );

    // ==========================================
    // Card-level routes
    // ==========================================

    // PUT /api/flashcards/cards/:cardId — Update single card
    this.router.put(
      '/cards/:cardId',
      authMiddleware(['trainer', 'org_admin']),
      validateRequest(UpdateCardSchema),
      this.updateCard.bind(this)
    );

    // DELETE /api/flashcards/cards/:cardId — Delete single card
    this.router.delete(
      '/cards/:cardId',
      authMiddleware(['trainer', 'org_admin']),
      this.deleteCard.bind(this)
    );
  }

  // ==========================================
  // Trainee handlers
  // ==========================================

  private async getAvailableDecks(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const courseId = req.query.courseId as string | undefined;
      const decks = await this.flashcardService.getAvailableDecks(traineeId, courseId);
      res.status(200).json({ decks });
    } catch (error) {
      next(error);
    }
  }

  private async getStudyCards(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      const traineeId = req.user!.userId;
      const cards = await this.flashcardService.getStudyCards(deckId, traineeId);
      res.status(200).json({ cards, totalDue: cards.length });
    } catch (error) {
      next(error);
    }
  }

  private async submitReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardId } = req.params;
      const traineeId = req.user!.userId;
      const { quality } = req.body;
      const result = await this.flashcardService.submitReview(cardId, traineeId, quality);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const traineeId = req.user!.userId;
      const progress = await this.flashcardService.getProgress(traineeId);
      res.status(200).json(progress);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Admin handlers
  // ==========================================

  private async listDecksForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || null;
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      const decks = await this.flashcardService.listDecksForAdmin(orgId, userId, userRole);
      res.status(200).json({ decks });
    } catch (error) {
      next(error);
    }
  }

  private async createDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const deck = await this.flashcardService.createDeck(creatorId, orgId, req.body);
      res.status(201).json(deck);
    } catch (error) {
      next(error);
    }
  }

  private async getDeckForAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      const deck = await this.flashcardService.getDeckForAdmin(deckId);
      res.status(200).json(deck);
    } catch (error) {
      next(error);
    }
  }

  private async updateDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      const deck = await this.flashcardService.updateDeck(deckId, req.body);
      res.status(200).json(deck);
    } catch (error) {
      next(error);
    }
  }

  private async deleteDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      await this.flashcardService.deleteDeck(deckId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private async publishDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      const { publish } = req.body;
      await this.flashcardService.publishDeck(deckId, publish);
      res.status(200).json({ message: publish ? 'Deck published' : 'Deck unpublished' });
    } catch (error) {
      next(error);
    }
  }

  private async addCardToDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { deckId } = req.params;
      const card = await this.flashcardService.addCardToDeck(deckId, req.body);
      res.status(201).json(card);
    } catch (error) {
      next(error);
    }
  }

  private async updateCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardId } = req.params;
      const card = await this.flashcardService.updateCard(cardId, req.body);
      res.status(200).json(card);
    } catch (error) {
      next(error);
    }
  }

  private async deleteCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cardId } = req.params;
      await this.flashcardService.deleteCard(cardId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private async generateDeck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.user!.userId;
      const orgId = req.organizationId || null;
      const deck = await this.flashcardService.generateDeck(creatorId, orgId, req.body);
      res.status(201).json(deck);
    } catch (error) {
      next(error);
    }
  }
}
