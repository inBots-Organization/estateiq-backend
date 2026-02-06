import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { orgIsolationMiddleware, trainerAccessMiddleware } from '../middleware/rbac.middleware';
import { notesService } from '../services/notes/notes.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware(['trainer', 'org_admin']));
router.use(orgIsolationMiddleware());

/**
 * GET /api/notes/trainees/:traineeId
 * Get all notes for a trainee
 */
router.get(
  '/trainees/:traineeId',
  trainerAccessMiddleware(),
  async (req: Request, res: Response) => {
    try {
      const { user, organizationId } = req;
      const { traineeId } = req.params;

      if (!user || !organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify trainee exists in same organization
      const trainee = await prisma.trainee.findFirst({
        where: { id: traineeId, organizationId },
      });

      if (!trainee) {
        return res.status(404).json({ error: 'Trainee not found' });
      }

      const notes = await notesService.getNotesForTrainee(
        traineeId,
        user.userId,
        user.role
      );

      return res.json({ notes });
    } catch (error) {
      console.error('Error fetching notes:', error);
      return res.status(500).json({ error: 'Failed to fetch notes' });
    }
  }
);

/**
 * POST /api/notes/trainees/:traineeId
 * Create a note on a trainee's profile
 */
router.post(
  '/trainees/:traineeId',
  trainerAccessMiddleware(),
  async (req: Request, res: Response) => {
    try {
      const { user, organizationId } = req;
      const { traineeId } = req.params;
      const { content, noteType } = req.body;

      if (!user || !organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Note content is required' });
      }

      // Verify trainee exists in same organization
      const trainee = await prisma.trainee.findFirst({
        where: { id: traineeId, organizationId },
      });

      if (!trainee) {
        return res.status(404).json({ error: 'Trainee not found' });
      }

      const note = await notesService.createNote({
        traineeId,
        authorId: user.userId,
        content: content.trim(),
        noteType,
      });

      return res.status(201).json({ note });
    } catch (error) {
      console.error('Error creating note:', error);
      return res.status(500).json({ error: 'Failed to create note' });
    }
  }
);

/**
 * PATCH /api/notes/:noteId
 * Update a note (author only)
 */
router.patch('/:noteId', async (req: Request, res: Response) => {
  try {
    const { user } = req;
    const { noteId } = req.params;
    const { content, noteType, isPinned } = req.body;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = {};
    if (content !== undefined) updateData.content = content.trim();
    if (noteType !== undefined) updateData.noteType = noteType;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    const note = await notesService.updateNote(noteId, user.userId, updateData);

    return res.json({ note });
  } catch (error: any) {
    console.error('Error updating note:', error);
    if (error.message === 'Note not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('author')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update note' });
  }
});

/**
 * DELETE /api/notes/:noteId
 * Delete a note (author or org_admin)
 */
router.delete('/:noteId', async (req: Request, res: Response) => {
  try {
    const { user } = req;
    const { noteId } = req.params;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await notesService.deleteNote(noteId, user.userId, user.role);

    return res.json({ success: true, message: 'Note deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    if (error.message === 'Note not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('authorized')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete note' });
  }
});

/**
 * PATCH /api/notes/:noteId/pin
 * Toggle pin status
 */
router.patch('/:noteId/pin', async (req: Request, res: Response) => {
  try {
    const { user } = req;
    const { noteId } = req.params;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const note = await notesService.togglePin(noteId, user.userId);

    return res.json({ note });
  } catch (error: any) {
    console.error('Error toggling pin:', error);
    if (error.message === 'Note not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('author')) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to toggle pin status' });
  }
});

export default router;
