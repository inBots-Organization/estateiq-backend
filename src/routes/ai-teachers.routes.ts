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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for avatars
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

// Default teachers configuration with full prompts
// Avatar URLs use DiceBear API with professional Saudi-themed illustrations
const DEFAULT_TEACHERS = [
  {
    name: 'ahmed',
    displayNameAr: 'أحمد',
    displayNameEn: 'Ahmed',
    descriptionAr: 'معلم الأساسيات - صبور ومشجع، يساعدك على فهم أساسيات العقار',
    descriptionEn: 'Fundamentals Teacher - Patient & Encouraging, helps you understand real estate basics',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Ahmed&backgroundColor=3b82f6&skinColor=d08b5b&hair=short01&hairColor=0a0a0a&facialHair=beard&facialHairColor=0a0a0a&eyes=happy&mouth=smile&clothingColor=1e3a5f',
    personality: 'friendly',
    level: 'beginner',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    brainQueryPrefix: 'basics fundamentals beginner',
    contextSource: 'brain',
    sortOrder: 1,
    isDefault: true,
    systemPromptAr: `أنت "أحمد" — معلم الأساسيات في منصة EstateIQ لتدريب وكلاء العقارات السعوديين.

## شخصيتك:
- صبور وداعم ومشجع
- تستخدم تشبيهات بسيطة وأمثلة من الحياة اليومية السعودية
- تشرح المفاهيم المعقدة بطريقة سهلة الفهم
- تحتفل بكل إنجاز صغير للمتدرب
- تتحدث باللهجة السعودية الودية

## ملف المتدرب:
{{PROFILE}}

## قاعدة المعرفة (من مستندات المنظمة):
{{CONTEXT}}

## قواعدك:
1. ركز على أساسيات العقارات: المصطلحات، الأنظمة، الإجراءات الأساسية
2. استخدم أمثلة بسيطة من السوق السعودي
3. لا تفترض معرفة مسبقة — اشرح كل شيء من الصفر
4. شجع المتدرب وادعمه باستمرار
5. اطرح أسئلة بسيطة للتأكد من الفهم
6. إذا سألك عن موضوع متقدم، اشرحه بطريقة مبسطة`,
    systemPromptEn: `You are "Ahmed" — the Fundamentals Teacher on EstateIQ platform for Saudi real estate agent training.

## Your Personality:
- Patient, supportive, and encouraging
- Uses simple analogies and everyday Saudi life examples
- Explains complex concepts in easy-to-understand ways
- Celebrates every small achievement
- Warm and approachable tone

## Trainee Profile:
{{PROFILE}}

## Knowledge Base (from organization documents):
{{CONTEXT}}

## Your Rules:
1. Focus on real estate basics: terminology, regulations, fundamental procedures
2. Use simple examples from the Saudi market
3. Don't assume prior knowledge — explain everything from scratch
4. Continuously encourage and support the trainee
5. Ask simple questions to verify understanding
6. If asked about advanced topics, simplify your explanation`,
    welcomeMessageAr: 'أهلاً وسهلاً! أنا أحمد، معلم الأساسيات. سأساعدك تفهم أساسيات العقارات بطريقة سهلة وممتعة.',
    welcomeMessageEn: 'Welcome! I am Ahmed, your Fundamentals Teacher. I will help you understand real estate basics in an easy and enjoyable way.',
  },
  {
    name: 'noura',
    displayNameAr: 'نورة',
    displayNameEn: 'Noura',
    descriptionAr: 'خبيرة المبيعات - حادة ومحترفة، تتحداك للوصول لأفضل أداء',
    descriptionEn: 'Sales Expert - Sharp & Professional, challenges you to reach peak performance',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Noura&backgroundColor=8b5cf6&skinColor=d08b5b&hair=long16&hairColor=0a0a0a&eyes=confident&mouth=serious&clothingColor=4c1d95&accessories=glasses',
    personality: 'challenging',
    level: 'intermediate',
    voiceId: 'meAbY2VpJkt1q46qk56T',
    brainQueryPrefix: 'sales strategy negotiation techniques',
    contextSource: 'brain',
    sortOrder: 2,
    isDefault: true,
    systemPromptAr: `أنت "نورة" — معلمة استراتيجيات المبيعات في منصة EstateIQ لتدريب وكلاء العقارات السعوديين.

## شخصيتك:
- حادة الذكاء ومحترفة
- تتحدى المتدرب بسيناريوهات واقعية
- تطرح أسئلة استفزازية لاختبار مهارات البيع
- تعطي ملاحظات مباشرة وصريحة
- تتوقع جهداً حقيقياً من المتدرب
- تتحدث باللهجة السعودية المهنية

## ملف المتدرب:
{{PROFILE}}

## قاعدة المعرفة (من مستندات المنظمة):
{{CONTEXT}}

## قواعدك:
1. ركز على استراتيجيات المبيعات والتفاوض وإدارة العملاء
2. اطرح سيناريوهات واقعية وتحدى المتدرب للرد عليها
3. علق على نقاط القوة والضعف في إجاباته بصراحة
4. قدم تقنيات مبيعات متقدمة مع أمثلة عملية
5. لا تقبل إجابات سطحية — اطلب التعمق
6. ادعم بالأرقام والإحصائيات من السوق السعودي`,
    systemPromptEn: `You are "Noura" — the Sales Strategy Teacher on EstateIQ platform for Saudi real estate agent training.

## Your Personality:
- Sharp, professional, and challenging
- Challenges trainees with realistic scenarios
- Asks probing questions to test sales skills
- Gives direct and honest feedback
- Expects real effort from trainees
- Professional yet approachable tone

## Trainee Profile:
{{PROFILE}}

## Knowledge Base (from organization documents):
{{CONTEXT}}

## Your Rules:
1. Focus on sales strategies, negotiation, and client management
2. Present realistic scenarios and challenge the trainee to respond
3. Comment on strengths and weaknesses in their answers honestly
4. Teach advanced sales techniques with practical examples
5. Don't accept surface-level answers — push for depth
6. Support with data and statistics from the Saudi market`,
    welcomeMessageAr: 'مرحباً! أنا نورة، معلمة استراتيجيات المبيعات. استعد للتحدي - سأدفعك لتكون أفضل نسخة منك.',
    welcomeMessageEn: 'Hello! I am Noura, your Sales Strategy Teacher. Get ready for a challenge - I will push you to be the best version of yourself.',
  },
  {
    name: 'anas',
    displayNameAr: 'أنس',
    displayNameEn: 'Anas',
    descriptionAr: 'كوتش الإغلاق - خبير متقدم في إتمام الصفقات وتحليل السوق',
    descriptionEn: 'Senior Closer Coach - Advanced expert in closing deals and market analysis',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Anas&backgroundColor=10b981&skinColor=d08b5b&hair=short04&hairColor=0a0a0a&facialHair=scruff&facialHairColor=0a0a0a&eyes=squint&mouth=smirk&clothingColor=065f46',
    personality: 'professional',
    level: 'advanced',
    voiceId: 'pFZP5JQG7iQjIQuC4Bku',
    brainQueryPrefix: 'advanced closing market analysis',
    contextSource: 'brain',
    sortOrder: 3,
    isDefault: true,
    systemPromptAr: `أنت "أنس" — المدرب الاحترافي للإغلاق في منصة EstateIQ لتدريب وكلاء العقارات السعوديين.

## شخصيتك:
- خبير محترف وذو مستوى عالٍ
- تستخدم مصطلحات متقدمة في العقارات والمبيعات
- تتوقع إجابات على مستوى الخبراء
- تحلل السوق بعمق وتشارك رؤى استراتيجية
- تتعامل مع المتدرب كزميل محترف
- تتحدث باللهجة السعودية المهنية الراقية

## ملف المتدرب:
{{PROFILE}}

## قاعدة المعرفة (من مستندات المنظمة):
{{CONTEXT}}

## قواعدك:
1. ركز على تقنيات الإغلاق المتقدمة وتحليل السوق
2. استخدم مصطلحات احترافية (yield, cap rate, ROI, etc.)
3. ناقش استراتيجيات التسعير والتقييم المتقدمة
4. تحدى المتدرب بحالات معقدة تتطلب تحليلاً عميقاً
5. شارك رؤى من السوق السعودي الحالي
6. قيّم إجابات المتدرب بمعايير احترافية عالية`,
    systemPromptEn: `You are "Anas" — the Senior Closer Coach on EstateIQ platform for Saudi real estate agent training.

## Your Personality:
- Elite professional expert
- Uses advanced real estate and sales terminology
- Expects expert-level answers
- Analyzes the market deeply and shares strategic insights
- Treats the trainee as a professional colleague
- Refined and authoritative tone

## Trainee Profile:
{{PROFILE}}

## Knowledge Base (from organization documents):
{{CONTEXT}}

## Your Rules:
1. Focus on advanced closing techniques and market analysis
2. Use professional terminology (yield, cap rate, ROI, etc.)
3. Discuss advanced pricing and valuation strategies
4. Challenge with complex cases requiring deep analysis
5. Share insights from the current Saudi market
6. Evaluate answers with high professional standards`,
    welcomeMessageAr: 'أهلاً بك. أنا أنس، المدرب الاحترافي للإغلاق. سنعمل معاً على المستوى الاحترافي.',
    welcomeMessageEn: 'Welcome. I am Anas, your Senior Closer Coach. We will work together at a professional level.',
  },
  {
    name: 'abdullah',
    displayNameAr: 'عبدالله',
    displayNameEn: 'Abdullah',
    descriptionAr: 'مرشد النمو - حكيم ومحلل، يساعدك على تطوير مسارك المهني',
    descriptionEn: 'Growth Mentor - Wise & Analytical, helps you develop your career path',
    avatarUrl: 'https://api.dicebear.com/7.x/personas/svg?seed=Abdullah&backgroundColor=f59e0b&skinColor=d08b5b&hair=short02&hairColor=3d3d3d&facialHair=full&facialHairColor=3d3d3d&eyes=open&mouth=smile&clothingColor=78350f&accessories=glasses',
    personality: 'wise',
    level: 'professional',
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    contextSource: 'user-history',
    sortOrder: 4,
    isDefault: true,
    systemPromptAr: `أنت "عبدالله" — مرشد النمو الشخصي في منصة EstateIQ لتدريب وكلاء العقارات السعوديين.

## شخصيتك:
- حكيم ومتأمل وداعم
- تعتمد على البيانات لتوجيه النصائح
- تنظر للصورة الكبيرة لتطور المتدرب
- تربط بين نتائج التدريبات المختلفة لإعطاء نصيحة شاملة
- تساعد المتدرب على فهم نقاط قوته وكيف يستثمرها
- تتحدث باللهجة السعودية الحكيمة

## ملف المتدرب:
{{PROFILE}}

## سجل أداء المتدرب (من جلساته الفعلية):
{{CONTEXT}}

## قواعدك:
1. حلل أداء المتدرب بناءً على سجله الفعلي (المحاكاة، الصوت، الاختبارات، التشخيص)
2. اربط بين نتائج مختلف التدريبات لإعطاء صورة شاملة
3. حدد أنماط التحسن أو التراجع وناقشها
4. قدم خطة تطوير مبنية على البيانات
5. شجع على التأمل الذاتي — اسأل المتدرب عن شعوره تجاه تقدمه
6. كن حكيماً ومتأنياً في نصائحك`,
    systemPromptEn: `You are "Abdullah" — the Growth Mentor on EstateIQ platform for Saudi real estate agent training.

## Your Personality:
- Wise, reflective, and supportive
- Data-driven in guidance and advice
- Sees the big picture of trainee development
- Connects results from different training sessions for comprehensive advice
- Helps trainees understand their strengths and how to leverage them
- Thoughtful and measured tone

## Trainee Profile:
{{PROFILE}}

## Trainee Performance History (from actual sessions):
{{CONTEXT}}

## Your Rules:
1. Analyze performance based on actual history (simulations, voice, quizzes, diagnostics)
2. Connect results across different training types for a comprehensive picture
3. Identify improvement or regression patterns and discuss them
4. Provide a data-driven development plan
5. Encourage self-reflection — ask how the trainee feels about their progress
6. Be wise and measured in your advice`,
    welcomeMessageAr: 'السلام عليكم. أنا عبدالله، مرشد النمو. سأساعدك تفهم تقدمك وتطور نفسك بناءً على بياناتك الفعلية.',
    welcomeMessageEn: 'Welcome. I am Abdullah, your Growth Mentor. I will help you understand your progress and develop yourself based on your actual performance data.',
  },
  {
    name: 'sara',
    displayNameAr: 'سارة',
    displayNameEn: 'Sara',
    descriptionAr: 'بوت الترحيب - مرشدتك الودودة للبداية، تساعدك في الخطوات الأولى',
    descriptionEn: 'Welcome Bot - Your friendly onboarding guide, helps you get started',
    avatarUrl: 'https://estateiq-app.vercel.app/avatars/sara.png',
    personality: 'friendly',
    level: 'general',
    voiceId: 'XrExE9yKIg1WjnnlVkGX',
    brainQueryPrefix: 'welcome onboarding getting started',
    contextSource: 'brain',
    sortOrder: 0,
    isDefault: true,
    systemPromptAr: `أنت "سارة" — بوت الترحيب في منصة EstateIQ لتدريب وكلاء العقارات السعوديين.

## شخصيتك:
- ودودة ومرحبة ومتحمسة
- تتحدث باللهجة السعودية بطريقة دافئة
- تجعل المتدربين الجدد يشعرون بالراحة والترحيب
- توجه المتدربين خطوة بخطوة في رحلتهم الأولى

## ملف المتدرب:
{{PROFILE}}

## قاعدة المعرفة:
{{CONTEXT}}

## قواعدك:
1. رحب بالمتدربين الجدد بحرارة
2. اشرح كيف تعمل المنصة بطريقة بسيطة
3. ساعدهم في فهم اختبار تحديد المستوى
4. أجب على أسئلتهم عن البداية
5. اجعلهم متحمسين لبدء رحلة التعلم`,
    systemPromptEn: `You are "Sara" — the Welcome Bot on EstateIQ platform for Saudi real estate agent training.

## Your Personality:
- Warm, welcoming, and enthusiastic
- Makes new trainees feel comfortable and welcomed
- Guides trainees step by step in their first journey
- Friendly and approachable tone

## Trainee Profile:
{{PROFILE}}

## Knowledge Base:
{{CONTEXT}}

## Your Rules:
1. Warmly welcome new trainees
2. Explain how the platform works in simple terms
3. Help them understand the placement test
4. Answer questions about getting started
5. Get them excited about their learning journey`,
    welcomeMessageAr: 'يا هلا والله! أنا سارة، مرشدتك للبداية. سعيدة إنك معانا! خليني أساعدك تبدأ رحلتك.',
    welcomeMessageEn: "Hello and welcome! I'm Sara, your onboarding guide. So happy you're here! Let me help you get started.",
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

    // Get teachers WITHOUT avatarUrl for fast initial load
    // Avatars are loaded separately via /avatars endpoint
    let teachers = await prisma.aITeacher.findMany({
      where: { organizationId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        organizationId: true,
        name: true,
        displayNameAr: true,
        displayNameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        // EXCLUDE avatarUrl - loaded separately for performance
        personality: true,
        level: true,
        voiceId: true,
        brainQueryPrefix: true,
        contextSource: true,
        sortOrder: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
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
                  documents: true,
                },
              },
            },
          })
        )
      );
      teachers = createdTeachers;
    }

    // Count trainees for each teacher (including legacy assignedTeacher field)
    const teachersWithCounts = await Promise.all(
      teachers.map(async (teacher) => {
        const traineeCount = await prisma.trainee.count({
          where: {
            organizationId,
            OR: [
              { assignedTeacherId: teacher.id },
              { assignedTeacher: teacher.name }, // Legacy field
            ],
          },
        });

        return {
          ...teacher,
          _count: {
            ...teacher._count,
            assignedTrainees: traineeCount,
          },
        };
      })
    );

    res.json({ teachers: teachersWithCounts });
  } catch (error) {
    console.error('Error fetching AI teachers:', error);
    res.status(500).json({ error: 'Failed to fetch AI teachers' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STATIC ROUTES - Must be defined BEFORE /:id routes to avoid conflicts
// ═══════════════════════════════════════════════════════════════════════════

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

// POST /api/admin/ai-teachers/resync - Update default teachers with latest prompts
router.post('/resync', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Update each default teacher with latest prompts
    const results = await Promise.all(
      DEFAULT_TEACHERS.map(async (teacher) => {
        const existing = await prisma.aITeacher.findFirst({
          where: { organizationId, name: teacher.name },
        });

        if (existing) {
          // Update with new prompts if they're currently empty
          return prisma.aITeacher.update({
            where: { id: existing.id },
            data: {
              // Only update prompts if they're empty
              ...((!existing.systemPromptAr || existing.systemPromptAr.trim() === '') && { systemPromptAr: teacher.systemPromptAr }),
              ...((!existing.systemPromptEn || existing.systemPromptEn.trim() === '') && { systemPromptEn: teacher.systemPromptEn }),
              ...((!existing.welcomeMessageAr || existing.welcomeMessageAr.trim() === '') && { welcomeMessageAr: teacher.welcomeMessageAr }),
              ...((!existing.welcomeMessageEn || existing.welcomeMessageEn.trim() === '') && { welcomeMessageEn: teacher.welcomeMessageEn }),
              // Update descriptions if empty
              ...((!existing.descriptionAr || existing.descriptionAr.trim() === '') && { descriptionAr: teacher.descriptionAr }),
              ...((!existing.descriptionEn || existing.descriptionEn.trim() === '') && { descriptionEn: teacher.descriptionEn }),
            },
          });
        }
        return null;
      })
    );

    const updatedCount = results.filter(r => r !== null).length;
    res.json({ message: `Updated ${updatedCount} default teachers with prompts`, updatedCount });
  } catch (error) {
    console.error('Error resyncing teachers:', error);
    res.status(500).json({ error: 'Failed to resync teachers' });
  }
});

// POST /api/admin/ai-teachers/sync-avatars - Update default teachers with avatars from config
router.post('/sync-avatars', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Update each default teacher with avatar URL from config
    const results = await Promise.all(
      DEFAULT_TEACHERS.map(async (teacher) => {
        const existing = await prisma.aITeacher.findFirst({
          where: { organizationId, name: teacher.name },
        });

        if (existing && teacher.avatarUrl) {
          // Always update avatar URL to latest from config
          return prisma.aITeacher.update({
            where: { id: existing.id },
            data: {
              avatarUrl: teacher.avatarUrl,
            },
          });
        }
        return null;
      })
    );

    const updatedCount = results.filter(r => r !== null).length;
    res.json({
      message: `Updated ${updatedCount} default teachers with avatars`,
      updatedCount,
      teachers: results.filter(r => r !== null).map(t => ({ name: t!.name, avatarUrl: t!.avatarUrl }))
    });
  } catch (error) {
    console.error('Error syncing avatars:', error);
    res.status(500).json({ error: 'Failed to sync avatars' });
  }
});

// POST /api/admin/ai-teachers/fix-base64-avatars - Convert base64 avatars to static URLs
router.post('/fix-base64-avatars', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Find all teachers with base64 avatars
    const teachersWithBase64 = await prisma.aITeacher.findMany({
      where: {
        organizationId,
        avatarUrl: { startsWith: 'data:' },
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    });

    if (teachersWithBase64.length === 0) {
      return res.json({ message: 'No teachers with base64 avatars found', fixedCount: 0 });
    }

    // Static avatar base URL (Vercel deployment)
    const AVATAR_BASE_URL = 'https://estateiq-app.vercel.app/avatars';

    // Update each teacher with static URL
    const results = await Promise.all(
      teachersWithBase64.map(async (teacher) => {
        // Use .webp extension for custom teachers, fallback to existing static avatars
        const staticUrl = `${AVATAR_BASE_URL}/${teacher.name}.webp`;

        return prisma.aITeacher.update({
          where: { id: teacher.id },
          data: { avatarUrl: staticUrl },
        });
      })
    );

    res.json({
      message: `Fixed ${results.length} teachers with base64 avatars`,
      fixedCount: results.length,
      teachers: results.map(t => ({
        name: t.name,
        newAvatarUrl: t.avatarUrl,
      })),
      note: 'Make sure the avatar files exist at the static URLs!',
    });
  } catch (error) {
    console.error('Error fixing base64 avatars:', error);
    res.status(500).json({ error: 'Failed to fix base64 avatars' });
  }
});

// POST /api/admin/ai-teachers/reset-evaluations - Reset all trainee evaluations
router.post('/reset-evaluations', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Reset all trainees in this organization:
    // - Clear assignedTeacher and assignedTeacherId
    // - Clear currentSkillLevel
    // - Clear lastDiagnosticAt
    const result = await prisma.trainee.updateMany({
      where: { organizationId },
      data: {
        assignedTeacher: null,
        assignedTeacherId: null,
        assignedTeacherAt: null,
        currentSkillLevel: null,
        lastDiagnosticAt: null,
      },
    });

    // Also delete all daily skill reports for this organization's trainees
    const traineeIds = await prisma.trainee.findMany({
      where: { organizationId },
      select: { id: true },
    });

    const deletedReports = await prisma.dailySkillReport.deleteMany({
      where: {
        traineeId: { in: traineeIds.map(t => t.id) },
      },
    });

    // Delete all diagnostic sessions for this organization's trainees
    const deletedSessions = await prisma.diagnosticSession.deleteMany({
      where: {
        traineeId: { in: traineeIds.map(t => t.id) },
      },
    });

    res.json({
      message: `Reset ${result.count} trainee evaluations successfully`,
      resetCount: result.count,
      deletedReports: deletedReports.count,
      deletedSessions: deletedSessions.count,
    });
  } catch (error) {
    console.error('Error resetting evaluations:', error);
    res.status(500).json({ error: 'Failed to reset evaluations' });
  }
});

// POST /api/admin/ai-teachers/force-resync - Force update all default teachers with latest prompts
router.post('/force-resync', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Force update each default teacher with latest prompts (overwrite existing)
    const results = await Promise.all(
      DEFAULT_TEACHERS.map(async (teacher) => {
        const existing = await prisma.aITeacher.findFirst({
          where: { organizationId, name: teacher.name },
        });

        if (existing) {
          return prisma.aITeacher.update({
            where: { id: existing.id },
            data: {
              systemPromptAr: teacher.systemPromptAr,
              systemPromptEn: teacher.systemPromptEn,
              welcomeMessageAr: teacher.welcomeMessageAr,
              welcomeMessageEn: teacher.welcomeMessageEn,
              descriptionAr: teacher.descriptionAr,
              descriptionEn: teacher.descriptionEn,
            },
          });
        }
        return null;
      })
    );

    const updatedCount = results.filter(r => r !== null).length;
    res.json({ message: `Force-updated ${updatedCount} default teachers with prompts`, updatedCount });
  } catch (error) {
    console.error('Error force-resyncing teachers:', error);
    res.status(500).json({ error: 'Failed to force-resync teachers' });
  }
});

// GET /api/admin/ai-teachers/avatars - Get all teacher avatars (for lazy loading)
router.get('/avatars', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const teachers = await prisma.aITeacher.findMany({
      where: { organizationId },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    // Return as a map for easy lookup
    const avatars: Record<string, string | null> = {};
    teachers.forEach((t) => {
      avatars[t.id] = t.avatarUrl;
    });

    res.json({ avatars });
  } catch (error) {
    console.error('Error fetching avatars:', error);
    res.status(500).json({ error: 'Failed to fetch avatars' });
  }
});

// GET /api/admin/ai-teachers/avatar-stats - Get avatar statistics (for debugging)
router.get('/avatar-stats', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const teachers = await prisma.aITeacher.findMany({
      where: { organizationId },
      select: {
        name: true,
        displayNameEn: true,
        avatarUrl: true,
      },
    });

    const stats = teachers.map((t) => {
      const avatarUrl = t.avatarUrl || '';
      const isBase64 = avatarUrl.startsWith('data:');
      const isWebP = avatarUrl.includes('image/webp');
      const sizeKB = Math.round(avatarUrl.length / 1024);

      return {
        name: t.name,
        displayName: t.displayNameEn,
        isBase64,
        isWebP,
        sizeKB,
        type: isBase64 ? avatarUrl.substring(5, avatarUrl.indexOf(';')) : 'external URL',
      };
    });

    const totalSizeKB = stats.reduce((sum, s) => sum + s.sizeKB, 0);

    res.json({
      teachers: stats,
      summary: {
        totalTeachers: stats.length,
        totalSizeKB,
        totalSizeMB: (totalSizeKB / 1024).toFixed(2),
        webpCount: stats.filter((s) => s.isWebP).length,
        base64Count: stats.filter((s) => s.isBase64).length,
      },
    });
  } catch (error) {
    console.error('Error fetching avatar stats:', error);
    res.status(500).json({ error: 'Failed to fetch avatar stats' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC ROUTES - These use :id parameter
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/ai-teachers/:id - Get single AI teacher with details (without avatar for speed)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Exclude avatarUrl for fast loading - loaded separately via /:id/avatar
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        displayNameAr: true,
        displayNameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        // avatarUrl excluded - loaded separately
        personality: true,
        level: true,
        voiceId: true,
        systemPromptAr: true,
        systemPromptEn: true,
        welcomeMessageAr: true,
        welcomeMessageEn: true,
        brainQueryPrefix: true,
        contextSource: true,
        sortOrder: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
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

// GET /api/admin/ai-teachers/:id/avatar - Get single teacher avatar (for lazy loading)
router.get('/:id/avatar', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
      select: { avatarUrl: true },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.json({ avatarUrl: teacher.avatarUrl });
  } catch (error) {
    console.error('Error fetching avatar:', error);
    res.status(500).json({ error: 'Failed to fetch avatar' });
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

    // Allow org admins to delete any teacher (including defaults) for their organization
    // This gives them full control over their teacher roster

    // Unassign trainees first (both new and legacy fields)
    await prisma.trainee.updateMany({
      where: {
        OR: [
          { assignedTeacherId: id },
          { assignedTeacher: existing.name },
        ]
      },
      data: {
        assignedTeacherId: null,
        assignedTeacher: null,
      },
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

    // Search by both assignedTeacherId (new) AND assignedTeacher name (legacy)
    const trainees = await prisma.trainee.findMany({
      where: {
        organizationId,
        OR: [
          { assignedTeacherId: id },
          { assignedTeacher: teacher.name }, // Legacy field - teacher name like "noura", "ahmed"
        ],
      },
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

// GET /api/admin/ai-teachers/:id/available-trainees - Get trainees not assigned to this teacher
router.get('/:id/available-trainees', async (req: Request, res: Response) => {
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

    // Get ALL trainees in the organization (for transfer capability)
    // We show all trainees except those already assigned to THIS specific teacher
    const trainees = await prisma.trainee.findMany({
      where: {
        organizationId,
        role: 'trainee',
        // Exclude only trainees assigned to THIS teacher (by ID or legacy name)
        AND: [
          { OR: [{ assignedTeacherId: { not: id } }, { assignedTeacherId: null }] },
          { OR: [{ assignedTeacher: { not: teacher.name } }, { assignedTeacher: null }] },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        currentSkillLevel: true,
        assignedTeacherId: true,
        assignedTeacher: true,
      },
      orderBy: { firstName: 'asc' },
    });

    // Get all teachers for displaying current assignments
    const allTeachers = await prisma.aITeacher.findMany({
      where: { organizationId },
      select: { id: true, displayNameAr: true, displayNameEn: true, name: true },
    });

    const teacherMapById = new Map(allTeachers.map(t => [t.id, t]));
    const teacherMapByName = new Map(allTeachers.map(t => [t.name, t]));

    // Enrich trainees with current teacher info
    const enrichedTrainees = trainees.map(trainee => {
      // Check by ID first, then by legacy name
      const currentTeacher = trainee.assignedTeacherId
        ? teacherMapById.get(trainee.assignedTeacherId)
        : trainee.assignedTeacher
          ? teacherMapByName.get(trainee.assignedTeacher)
          : null;

      return {
        ...trainee,
        currentTeacherName: currentTeacher
          ? { ar: currentTeacher.displayNameAr, en: currentTeacher.displayNameEn }
          : null,
        hasAssignment: !!(trainee.assignedTeacherId || trainee.assignedTeacher),
      };
    });

    res.json({ trainees: enrichedTrainees });
  } catch (error) {
    console.error('Error fetching available trainees:', error);
    res.status(500).json({ error: 'Failed to fetch available trainees' });
  }
});

// POST /api/admin/ai-teachers/:id/assign-trainees - Bulk assign trainees to teacher
router.post('/:id/assign-trainees', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;
    const { traineeIds } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!Array.isArray(traineeIds) || traineeIds.length === 0) {
      return res.status(400).json({ error: 'traineeIds must be a non-empty array' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Assign trainees
    const result = await prisma.trainee.updateMany({
      where: {
        id: { in: traineeIds },
        organizationId,
      },
      data: {
        assignedTeacherId: teacher.id,
        assignedTeacher: teacher.name,
        assignedTeacherAt: new Date(),
      },
    });

    res.json({
      message: `${result.count} trainee(s) assigned to ${teacher.displayNameEn}`,
      assignedCount: result.count,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        displayNameAr: teacher.displayNameAr,
        displayNameEn: teacher.displayNameEn,
      },
    });
  } catch (error) {
    console.error('Error assigning trainees:', error);
    res.status(500).json({ error: 'Failed to assign trainees' });
  }
});

// POST /api/admin/ai-teachers/:id/unassign-trainees - Bulk unassign trainees from teacher
router.post('/:id/unassign-trainees', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;
    const { traineeIds } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!Array.isArray(traineeIds) || traineeIds.length === 0) {
      return res.status(400).json({ error: 'traineeIds must be a non-empty array' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Unassign trainees (handle both new assignedTeacherId and legacy assignedTeacher field)
    const result = await prisma.trainee.updateMany({
      where: {
        id: { in: traineeIds },
        organizationId,
        OR: [
          { assignedTeacherId: id },
          { assignedTeacher: teacher.name }, // Legacy field
        ],
      },
      data: {
        assignedTeacherId: null,
        assignedTeacher: null,
        assignedTeacherAt: null,
      },
    });

    res.json({
      message: `${result.count} trainee(s) unassigned from ${teacher.displayNameEn}`,
      unassignedCount: result.count,
    });
  } catch (error) {
    console.error('Error unassigning trainees:', error);
    res.status(500).json({ error: 'Failed to unassign trainees' });
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

    // Get documents by teacherId OR by legacy targetPersona (teacher name)
    const documents = await prisma.brainDocument.findMany({
      where: {
        organizationId,
        OR: [
          { teacherId: id },
          { targetPersona: teacher.name }, // Legacy field - teacher name like "firas", "noura"
        ],
      },
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

// PUT /api/admin/ai-teachers/:id/avatar-url - Set avatar URL directly (for static/external avatars)
router.put('/:id/avatar-url', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const organizationId = await getOrganizationId(req);
    const { id } = req.params;
    const { avatarUrl } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ error: 'avatarUrl is required' });
    }

    // Don't allow base64 URLs - they're too large
    if (avatarUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Base64 URLs are not allowed. Use a direct URL instead.' });
    }

    // Verify teacher exists
    const teacher = await prisma.aITeacher.findFirst({
      where: { id, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

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
    console.error('Error setting avatar URL:', error);
    res.status(500).json({ error: 'Failed to set avatar URL' });
  }
});

// POST /api/admin/ai-teachers/:id/avatar - Upload teacher avatar
router.post('/:id/avatar', (req: Request, res: Response, next) => {
  // Handle multer upload with proper error handling
  upload.single('avatar')(req, res, async (uploadError) => {
    try {
      // Check for multer errors first
      if (uploadError) {
        console.error('Multer upload error:', uploadError);
        if (uploadError instanceof multer.MulterError) {
          if (uploadError.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
          }
          return res.status(400).json({ error: `Upload error: ${uploadError.message}` });
        }
        return res.status(400).json({ error: uploadError.message || 'Failed to upload file' });
      }

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

      // Generate a unique filename based on teacher name and timestamp
      const timestamp = Date.now();
      const extension = req.file.mimetype === 'image/webp' ? 'webp' :
                       req.file.mimetype === 'image/png' ? 'png' : 'jpg';
      const fileName = `${teacher.name}-${timestamp}.${extension}`;

      // For now, store as base64 but return a warning
      // In production, this should upload to GCS/S3 and return a URL
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

      // Return teacher without the full base64 in response (to avoid huge responses)
      // The frontend should use the static URL pattern instead
      res.json({
        teacher: {
          ...updatedTeacher,
          avatarUrl: updatedTeacher.avatarUrl?.startsWith('data:')
            ? `[base64 stored - use static URL: https://estateiq-app.vercel.app/avatars/${teacher.name}.webp]`
            : updatedTeacher.avatarUrl,
        },
        warning: 'Base64 avatar stored. For better performance, upload the image to /public/avatars/ and use PUT /avatar-url to set the URL.',
        suggestedUrl: `https://estateiq-app.vercel.app/avatars/${teacher.name}.webp`,
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  });
});

export default router;
