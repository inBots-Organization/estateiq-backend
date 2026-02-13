/**
 * Trainee Courses Routes
 * For trainees to view published courses from their organization
 * Different from admin-courses which is for management
 * Route: /api/trainee/courses
 */

import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';

const router = Router();

// All trainee courses routes require authentication
router.use(authMiddleware());

// Helper function to get organization ID
async function getOrganizationId(req: Request): Promise<string | null> {
  if (req.organizationId) {
    return req.organizationId;
  }
  const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');
  const user = await traineeRepo.findById(req.user!.userId);
  return user?.organizationId || null;
}

// Course categories with translations (same as admin)
const COURSE_CATEGORIES = [
  { value: 'fundamentals', labelAr: 'الأساسيات', labelEn: 'Fundamentals' },
  { value: 'sales', labelAr: 'مهارات البيع', labelEn: 'Sales Skills' },
  { value: 'customer-relations', labelAr: 'علاقات العملاء', labelEn: 'Customer Relations' },
  { value: 'specialization', labelAr: 'التخصص', labelEn: 'Specialization' },
  { value: 'marketing', labelAr: 'التسويق', labelEn: 'Marketing' },
  { value: 'legal', labelAr: 'القانون العقاري', labelEn: 'Real Estate Law' },
];

const DIFFICULTY_LEVELS = [
  { value: 'beginner', labelAr: 'مبتدئ', labelEn: 'Beginner' },
  { value: 'intermediate', labelAr: 'متوسط', labelEn: 'Intermediate' },
  { value: 'advanced', labelAr: 'متقدم', labelEn: 'Advanced' },
];

// ═══════════════════════════════════════════════════════════════════════════
// LIST PUBLISHED COURSES (for trainees)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/courses - List all published courses for organization
router.get('/', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Query params for filtering
    const { category, difficulty, search } = req.query;

    const where: any = {
      organizationId,
      isPublished: true, // Only published courses for trainees
    };

    if (category && category !== 'all') {
      where.category = category;
    }

    if (difficulty && difficulty !== 'all') {
      where.difficulty = difficulty;
    }

    if (search) {
      where.OR = [
        { titleAr: { contains: search as string, mode: 'insensitive' } },
        { titleEn: { contains: search as string, mode: 'insensitive' } },
        { title: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        lectures: {
          orderBy: { orderInCourse: 'asc' },
          select: {
            id: true,
            titleAr: true,
            titleEn: true,
            title: true,
            descriptionAr: true,
            descriptionEn: true,
            description: true,
            videoUrl: true,
            videoType: true,
            durationMinutes: true,
            orderInCourse: true,
          },
        },
        _count: {
          select: {
            lectures: true,
            attachments: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'desc' },
      ],
    });

    // Transform courses to match the frontend expected format
    const formattedCourses = courses.map(course => ({
      id: course.id,
      titleAr: course.titleAr,
      titleEn: course.titleEn,
      descriptionAr: course.descriptionAr,
      descriptionEn: course.descriptionEn,
      category: course.category,
      difficulty: course.difficulty,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      objectivesAr: safeJsonParse(course.objectivesAr, []),
      objectivesEn: safeJsonParse(course.objectivesEn, []),
      thumbnailUrl: course.thumbnailUrl,
      notesAr: course.notesAr,
      notesEn: course.notesEn,
      recommendedSimulation: course.recommendedSimulationType ? {
        type: course.recommendedSimulationType as 'text' | 'voice',
        scenarioType: course.recommendedSimulationScenario || '',
        difficultyLevel: course.recommendedSimulationDifficulty || 'medium',
      } : null,
      lessons: course.lectures.map(lecture => ({
        id: lecture.id,
        titleAr: lecture.titleAr,
        titleEn: lecture.titleEn,
        descriptionAr: lecture.descriptionAr,
        descriptionEn: lecture.descriptionEn,
        videoId: extractYouTubeId(lecture.videoUrl),
        videoUrl: lecture.videoUrl,
        durationMinutes: lecture.durationMinutes,
        order: lecture.orderInCourse,
      })),
      lecturesCount: course._count.lectures,
      attachmentsCount: course._count.attachments,
    }));

    res.json({
      courses: formattedCourses,
      categories: COURSE_CATEGORIES,
      difficulties: DIFFICULTY_LEVELS,
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SINGLE COURSE (for trainees)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/courses/:id - Get single published course with lectures
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const course = await prisma.course.findFirst({
      where: {
        id,
        organizationId,
        isPublished: true, // Only published courses
      },
      include: {
        lectures: {
          orderBy: { orderInCourse: 'asc' },
        },
        attachments: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            titleAr: true,
            titleEn: true,
            fileName: true,
            fileType: true,
            fileSize: true,
            fileUrl: true,
            displayOrder: true,
          },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Format response
    const formattedCourse = {
      id: course.id,
      titleAr: course.titleAr,
      titleEn: course.titleEn,
      descriptionAr: course.descriptionAr,
      descriptionEn: course.descriptionEn,
      category: course.category,
      difficulty: course.difficulty,
      estimatedDurationMinutes: course.estimatedDurationMinutes,
      objectivesAr: safeJsonParse(course.objectivesAr, []),
      objectivesEn: safeJsonParse(course.objectivesEn, []),
      thumbnailUrl: course.thumbnailUrl,
      notesAr: course.notesAr,
      notesEn: course.notesEn,
      recommendedSimulation: course.recommendedSimulationType ? {
        type: course.recommendedSimulationType as 'text' | 'voice',
        scenarioType: course.recommendedSimulationScenario || '',
        difficultyLevel: course.recommendedSimulationDifficulty || 'medium',
      } : null,
      lessons: course.lectures.map(lecture => ({
        id: lecture.id,
        titleAr: lecture.titleAr,
        titleEn: lecture.titleEn,
        descriptionAr: lecture.descriptionAr,
        descriptionEn: lecture.descriptionEn,
        videoId: extractYouTubeId(lecture.videoUrl),
        videoUrl: lecture.videoUrl,
        durationMinutes: lecture.durationMinutes,
        order: lecture.orderInCourse,
      })),
      attachments: course.attachments,
    };

    res.json({ course: formattedCourse });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET COURSES CONTEXT FOR AI TEACHER
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/courses/context/ai-teacher - Get courses context for AI recommendations
router.get('/context/ai-teacher', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get published courses with basic info for AI context
    const courses = await prisma.course.findMany({
      where: {
        organizationId,
        isPublished: true,
      },
      select: {
        id: true,
        titleAr: true,
        titleEn: true,
        descriptionAr: true,
        descriptionEn: true,
        category: true,
        difficulty: true,
        estimatedDurationMinutes: true,
        objectivesAr: true,
        objectivesEn: true,
        lectures: {
          orderBy: { orderInCourse: 'asc' },
          select: {
            id: true,
            titleAr: true,
            titleEn: true,
            durationMinutes: true,
            orderInCourse: true,
          },
        },
      },
      orderBy: [
        { difficulty: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Format for AI context
    const coursesContext = courses.map(course => ({
      id: course.id,
      titleAr: course.titleAr,
      titleEn: course.titleEn,
      descriptionAr: course.descriptionAr,
      descriptionEn: course.descriptionEn,
      category: course.category,
      difficulty: course.difficulty,
      durationMinutes: course.estimatedDurationMinutes,
      objectivesAr: safeJsonParse(course.objectivesAr, []),
      objectivesEn: safeJsonParse(course.objectivesEn, []),
      lecturesCount: course.lectures.length,
      lectures: course.lectures.map(l => ({
        id: l.id,
        titleAr: l.titleAr,
        titleEn: l.titleEn,
        durationMinutes: l.durationMinutes,
        order: l.orderInCourse,
      })),
      // Direct link for AI to recommend
      link: `/courses/${course.id}`,
    }));

    res.json({ courses: coursesContext });
  } catch (error) {
    console.error('Error fetching courses context:', error);
    res.status(500).json({ error: 'Failed to fetch courses context' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function safeJsonParse(json: string | null, defaultValue: any): any {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

function extractYouTubeId(url: string): string {
  if (!url) return '';

  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return url; // Return as-is if not a YouTube URL
}

export default router;
