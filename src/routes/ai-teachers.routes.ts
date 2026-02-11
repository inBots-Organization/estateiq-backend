import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';
import multer from 'multer';

const router = Router();

// All AI Teachers routes require authentication with admin role
router.use(authMiddleware(['admin', 'org_admin']));

// Configure multer for avatar uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for avatars
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// Helper function to get organization ID (supports impersonation)
async function getOrganizationId(req: Request): Promise<string | null> {
  if (req.organizationId) {
    return req.organizationId;
  }
  const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');
  const user = await traineeRepo.findById(req.user!.userId);
  return user?.organizationId || null;
}

// Default teachers configuration
const DEFAULT_TEACHERS = [
  {
    name: 'ahmed',
    displayNameAr: 'أحمد',
    displayNameEn: 'Ahmed',
    descriptionAr: 'معلم الأساسيات - صبور ومشجع، يساعدك على فهم أساسيات العقار',
    descriptionEn: 'Fundamentals Teacher - Patient & Encouraging, helps you understand real estate basics',
    personality: 'friendly',
    level: 'beginner',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    brainQueryPrefix: 'basics fundamentals beginner',
    contextSource: 'brain',
    sortOrder: 1,
    isDefault: true,
  },
  {
    name: 'noura',
    displayNameAr: 'نورة',
    displayNameEn: 'Noura',
    descriptionAr: 'خبيرة المبيعات - حادة ومحترفة، تتحداك للوصول لأفضل أداء',
    descriptionEn: 'Sales Expert - Sharp & Professional, challenges you to reach peak performance',
    personality: 'challenging',
    level: 'intermediate',
    voiceId: 'meAbY2VpJkt1q46qk56T',
    brainQueryPrefix: 'sales strategy negotiation techniques',
    contextSource: 'brain',
    sortOrder: 2,
    isDefault: true,
  },
  {
    name: 'anas',
    displayNameAr: 'أنس',
    displayNameEn: 'Anas',
    descriptionAr: 'كوتش الإغلاق - خبير متقدم في إتمام الصفقات وتحليل السوق',
    descriptionEn: 'Senior Closer Coach - Advanced expert in closing deals and market analysis',
    personality: 'professional',
    level: 'advanced',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku',
    brainQueryPrefix: 'advanced closing market analysis',
    contextSource: 'brain',
    sortOrder: 3,
    isDefault: true,
  },
  {
    name: 'abdullah',
    displayNameAr: 'عبدالله',
    displayNameEn: 'Abdullah',
    descriptionAr: 'مرشد النمو - حكيم ومحلل، يساعدك على تطوير مسارك المهني',
    descriptionEn: 'Growth Mentor - Wise & Analytical, helps you develop your career path',
    personality: 'wise',
    level: 'professional',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    contextSource: 'user-history',
    sortOrder: 4,
    isDefault: true,
  },
];

// GET /api/admin/ai-teachers - List all AI teachers for organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get teachers with counts
    const teachers = await prisma.aITeacher.findMany({
      where: { organizationId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: {
            assignedTrainees: true,
            documents: true,
          },
        },
      },
    });

    // If no teachers exist, seed default teachers
    if (teachers.length === 0) {
      const createdTeachers = await Promise.all(
        DEFAULT_TEACHERS.map((teacher) =>
          prisma.aITeacher.create({
            data: {
              ...teacher,
              organizationId,
            },
            include: {
              _count: {
                select: {
                  assignedTrainees: true,
                  documents: true,
                },
              },
            },
          })
        )
      );
      return res.json({ teachers: createdTeachers });
    }

    res.json({ teachers });
  } catch (error) {
    console.error('Error fetching AI teachers:', error);
    res.status(500).json({ error: 'Failed to fetch AI teachers' });
  }
});

// GET /api/admin/ai-teachers/:id - Get single AI teacher with details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: {
            assignedTrainees: true,
            documents: true,
          },
        },
      },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.json({ teacher });
  } catch (error) {
    console.error('Error fetching AI teacher:', error);
    res.status(500).json({ error: 'Failed to fetch AI teacher' });
  }
});

// POST /api/admin/ai-teachers - Create new AI teacher
router.post('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const {
      name,
      displayNameAr,
      displayNameEn,
      descriptionAr,
      descriptionEn,
      personality,
      level,
      voiceId,
      systemPromptAr,
      systemPromptEn,
      welcomeMessageAr,
      welcomeMessageEn,
      brainQueryPrefix,
      contextSource,
      sortOrder,
    } = req.body;

    // Validate required fields
    if (!name || !displayNameAr || !displayNameEn) {
      return res.status(400).json({ error: 'Name and display names are required' });
    }

    // Check for duplicate name
    const existing = await prisma.aITeacher.findFirst({
      where: { organizationId, name },
    });

    if (existing) {
      return res.status(400).json({ error: 'A teacher with this name already exists' });
    }

    // Get max sort order
    const maxSortOrder = await prisma.aITeacher.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });

    const teacher = await prisma.aITeacher.create({
      data: {
        organizationId,
        name: name.toLowerCase().replace(/\s+/g, '-'),
        displayNameAr,
        displayNameEn,
        descriptionAr,
        descriptionEn,
        personality: personality || 'friendly',
        level: level || 'general',
        voiceId,
        systemPromptAr,
        systemPromptEn,
        welcomeMessageAr,
        welcomeMessageEn,
        brainQueryPrefix,
        contextSource: contextSource || 'brain',
        sortOrder: sortOrder ?? (maxSortOrder._max.sortOrder || 0) + 1,
        isDefault: false,
      },
      include: {
        _count: {
          select: {
            assignedTrainees: true,
            documents: true,
          },
        },
      },
    });

    res.status(201).json({ teacher });
  } catch (error) {
    console.error('Error creating AI teacher:', error);
    res.status(500).json({ error: 'Failed to create AI teacher' });
  }
});

// PATCH /api/admin/ai-teachers/:id - Update AI teacher
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify teacher exists and belongs to org
    const existing = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const {
      displayNameAr,
      displayNameEn,
      descriptionAr,
      descriptionEn,
      personality,
      level,
      voiceId,
      systemPromptAr,
      systemPromptEn,
      welcomeMessageAr,
      welcomeMessageEn,
      brainQueryPrefix,
      contextSource,
      sortOrder,
      isActive,
    } = req.body;

    const teacher = await prisma.aITeacher.update({
      where: { id },
      data: {
        ...(displayNameAr !== undefined && { displayNameAr }),
        ...(displayNameEn !== undefined && { displayNameEn }),
        ...(descriptionAr !== undefined && { descriptionAr }),
        ...(descriptionEn !== undefined && { descriptionEn }),
        ...(personality !== undefined && { personality }),
        ...(level !== undefined && { level }),
        ...(voiceId !== undefined && { voiceId }),
        ...(systemPromptAr !== undefined && { systemPromptAr }),
        ...(systemPromptEn !== undefined && { systemPromptEn }),
        ...(welcomeMessageAr !== undefined && { welcomeMessageAr }),
        ...(welcomeMessageEn !== undefined && { welcomeMessageEn }),
        ...(brainQueryPrefix !== undefined && { brainQueryPrefix }),
        ...(contextSource !== undefined && { contextSource }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        _count: {
          select: {
            assignedTrainees: true,
            documents: true,
          },
        },
      },
    });

    res.json({ teacher });
  } catch (error) {
    console.error('Error updating AI teacher:', error);
    res.status(500).json({ error: 'Failed to update AI teacher' });
  }
});

// DELETE /api/admin/ai-teachers/:id - Delete AI teacher
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify teacher exists and belongs to org
    const existing = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Don't allow deleting default teachers
    if (existing.isDefault) {
      return res.status(400).json({ error: 'Cannot delete default teachers. You can deactivate them instead.' });
    }

    // Unassign trainees first
    await prisma.trainee.updateMany({
      where: { assignedTeacherId: id },
      data: { assignedTeacherId: null },
    });

    // Unlink documents
    await prisma.brainDocument.updateMany({
      where: { teacherId: id },
      data: { teacherId: null },
    });

    // Delete teacher
    await prisma.aITeacher.delete({
      where: { id },
    });

    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Error deleting AI teacher:', error);
    res.status(500).json({ error: 'Failed to delete AI teacher' });
  }
});

// GET /api/admin/ai-teachers/:id/trainees - Get trainees assigned to teacher
router.get('/:id/trainees', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const trainees = await prisma.trainee.findMany({
      where: { assignedTeacherId: id, organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentSkillLevel: true,
        assignedTeacherAt: true,
        lastActiveAt: true,
      },
      orderBy: { lastName: 'asc' },
    });

    res.json({ trainees });
  } catch (error) {
    console.error('Error fetching teacher trainees:', error);
    res.status(500).json({ error: 'Failed to fetch trainees' });
  }
});

// GET /api/admin/ai-teachers/:id/documents - Get documents assigned to teacher
router.get('/:id/documents', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const documents = await prisma.brainDocument.findMany({
      where: { teacherId: id, organizationId },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        status: true,
        chunkCount: true,
        contentLevel: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ documents });
  } catch (error) {
    console.error('Error fetching teacher documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/admin/ai-teachers/:id/avatar - Upload teacher avatar
router.post('/:id/avatar', upload.single('avatar'), async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No avatar file uploaded' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Convert to base64 data URL for now (can be replaced with GCS later)
    const base64 = req.file.buffer.toString('base64');
    const avatarUrl = `data:${req.file.mimetype};base64,${base64}`;

    const updatedTeacher = await prisma.aITeacher.update({
      where: { id },
      data: { avatarUrl },
      include: {
        _count: {
          select: {
            assignedTrainees: true,
            documents: true,
          },
        },
      },
    });

    res.json({ teacher: updatedTeacher });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// POST /api/admin/ai-teachers/seed - Seed default teachers (utility endpoint)
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Check if teachers already exist
    const existingCount = await prisma.aITeacher.count({
      where: { organizationId },
    });

    if (existingCount > 0) {
      return res.status(400).json({ error: 'Teachers already exist for this organization' });
    }

    // Create default teachers
    const teachers = await Promise.all(
      DEFAULT_TEACHERS.map((teacher) =>
        prisma.aITeacher.create({
          data: {
            ...teacher,
            organizationId,
          },
        })
      )
    );

    res.status(201).json({ teachers, message: `${teachers.length} default teachers created` });
  } catch (error) {
    console.error('Error seeding teachers:', error);
    res.status(500).json({ error: 'Failed to seed teachers' });
  }
});

export default router;
