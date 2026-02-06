import { PrismaClient, TraineeNote } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateNoteInput {
  traineeId: string;
  authorId: string;
  content: string;
  noteType?: string;
}

export interface UpdateNoteInput {
  content?: string;
  noteType?: string;
  isPinned?: boolean;
}

export interface NoteWithAuthor extends TraineeNote {
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class NotesService {
  /**
   * Create a new note on a trainee's profile
   */
  async createNote(input: CreateNoteInput): Promise<TraineeNote> {
    return prisma.traineeNote.create({
      data: {
        traineeId: input.traineeId,
        authorId: input.authorId,
        content: input.content,
        noteType: input.noteType || 'general',
      },
    });
  }

  /**
   * Get all notes for a trainee
   * Admins see all notes, trainers see only their own notes
   */
  async getNotesForTrainee(
    traineeId: string,
    viewerId: string,
    viewerRole: string
  ): Promise<NoteWithAuthor[]> {
    const where: any = { traineeId };

    // Trainers can only see their own notes
    if (viewerRole === 'trainer') {
      where.authorId = viewerId;
    }

    const notes = await prisma.traineeNote.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return notes as NoteWithAuthor[];
  }

  /**
   * Update a note (only author can update)
   */
  async updateNote(
    noteId: string,
    authorId: string,
    input: UpdateNoteInput
  ): Promise<TraineeNote> {
    const note = await prisma.traineeNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new Error('Note not found');
    }

    if (note.authorId !== authorId) {
      throw new Error('Only the author can update this note');
    }

    return prisma.traineeNote.update({
      where: { id: noteId },
      data: input,
    });
  }

  /**
   * Delete a note (author or org_admin can delete)
   */
  async deleteNote(
    noteId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    const note = await prisma.traineeNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new Error('Note not found');
    }

    // Only author or org_admin can delete
    if (note.authorId !== userId && userRole !== 'org_admin') {
      throw new Error('Not authorized to delete this note');
    }

    await prisma.traineeNote.delete({
      where: { id: noteId },
    });
  }

  /**
   * Toggle pin status of a note
   */
  async togglePin(noteId: string, authorId: string): Promise<TraineeNote> {
    const note = await prisma.traineeNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new Error('Note not found');
    }

    if (note.authorId !== authorId) {
      throw new Error('Only the author can pin/unpin this note');
    }

    return prisma.traineeNote.update({
      where: { id: noteId },
      data: { isPinned: !note.isPinned },
    });
  }
}

export const notesService = new NotesService();
