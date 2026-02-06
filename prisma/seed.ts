import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: {
      id: 'default-org',
      name: 'Default Training Organization',
      type: 'training_company',
    },
  });
  console.log('Created organization:', org.name);

  // Create default program
  const program = await prisma.program.upsert({
    where: { id: 'default-program' },
    update: {},
    create: {
      id: 'default-program',
      title: 'Real Estate Fundamentals',
      description: 'Complete training program for real estate professionals',
      isActive: true,
    },
  });
  console.log('Created program:', program.title);

  // Create default level
  const level = await prisma.level.upsert({
    where: { id: 'default-level' },
    update: {},
    create: {
      id: 'default-level',
      programId: program.id,
      title: 'Beginner',
      orderInProgram: 1,
    },
  });
  console.log('Created level:', level.title);

  // Create all courses with their lectures (matching frontend data)
  const coursesData = [
    {
      id: 'real-estate-fundamentals',
      title: 'أساسيات العقارات / Real Estate Fundamentals',
      description: 'Master the basics of real estate sales',
      difficulty: 'beginner',
      category: 'fundamentals',
      estimatedDurationMinutes: 85,
      lessons: [
        { id: 'fund-1', title: 'مقدمة في مبيعات العقارات', duration: 15 },
        { id: 'fund-2', title: 'فهم سوق العقارات', duration: 20 },
        { id: 'fund-3', title: 'بناء علاقات العملاء', duration: 18 },
        { id: 'fund-4', title: 'أساسيات عرض العقارات', duration: 17 },
        { id: 'fund-5', title: 'إتمام صفقتك الأولى', duration: 15 },
      ],
    },
    {
      id: 'negotiation-mastery',
      title: 'إتقان التفاوض / Negotiation Mastery',
      description: 'Advanced negotiation techniques',
      difficulty: 'intermediate',
      category: 'sales',
      estimatedDurationMinutes: 120,
      lessons: [
        { id: 'neg-1', title: 'علم نفس التفاوض', duration: 22 },
        { id: 'neg-2', title: 'استراتيجيات التفاوض على السعر', duration: 25 },
        { id: 'neg-3', title: 'التعامل مع الاعتراضات باحترافية', duration: 20 },
        { id: 'neg-4', title: 'إنشاء سيناريوهات الفوز للجميع', duration: 18 },
        { id: 'neg-5', title: 'تقنيات الإغلاق المتقدمة', duration: 20 },
        { id: 'neg-6', title: 'التعامل مع المفاوضات الصعبة', duration: 15 },
      ],
    },
    {
      id: 'client-psychology',
      title: 'علم نفس العميل / Client Psychology',
      description: 'Understand buyer behavior',
      difficulty: 'intermediate',
      category: 'client-relations',
      estimatedDurationMinutes: 90,
      lessons: [
        { id: 'psy-1', title: 'فهم سلوك المشتري', duration: 20 },
        { id: 'psy-2', title: 'المحفزات العاطفية في العقارات', duration: 18 },
        { id: 'psy-3', title: 'بناء الألفة الفورية', duration: 17 },
        { id: 'psy-4', title: 'قراءة لغة الجسد', duration: 20 },
        { id: 'psy-5', title: 'توجيه اتخاذ القرار', duration: 15 },
      ],
    },
    {
      id: 'luxury-properties',
      title: 'مبيعات العقارات الفاخرة / Luxury Property Sales',
      description: 'Specialized training for high-end properties',
      difficulty: 'advanced',
      category: 'specialization',
      estimatedDurationMinutes: 105,
      lessons: [
        { id: 'lux-1', title: 'سوق العقارات الفاخرة', duration: 22 },
        { id: 'lux-2', title: 'العمل مع العملاء الأثرياء', duration: 20 },
        { id: 'lux-3', title: 'عرض العقارات الفاخرة', duration: 23 },
        { id: 'lux-4', title: 'تسويق العقارات المميزة', duration: 20 },
        { id: 'lux-5', title: 'إتمام الصفقات عالية القيمة', duration: 20 },
      ],
    },
    {
      id: 'digital-marketing',
      title: 'التسويق الرقمي للوكلاء / Digital Marketing for Agents',
      description: 'Leverage digital tools to grow your business',
      difficulty: 'beginner',
      category: 'marketing',
      estimatedDurationMinutes: 75,
      lessons: [
        { id: 'dig-1', title: 'وسائل التواصل الاجتماعي للعقارات', duration: 18 },
        { id: 'dig-2', title: 'إنشاء قوائم جذابة', duration: 15 },
        { id: 'dig-3', title: 'استراتيجيات توليد العملاء', duration: 17 },
        { id: 'dig-4', title: 'بناء علامتك التجارية الشخصية', duration: 15 },
        { id: 'dig-5', title: 'أساسيات التسويق عبر البريد الإلكتروني', duration: 10 },
      ],
    },
    {
      id: 'first-time-buyers',
      title: 'العمل مع المشترين لأول مرة / Working with First-Time Buyers',
      description: 'Help first-time buyers navigate the process',
      difficulty: 'beginner',
      category: 'specialization',
      estimatedDurationMinutes: 80,
      lessons: [
        { id: 'ftb-1', title: 'عقلية المشتري لأول مرة', duration: 16 },
        { id: 'ftb-2', title: 'شرح خيارات التمويل', duration: 18 },
        { id: 'ftb-3', title: 'عملية البحث عن منزل', duration: 15 },
        { id: 'ftb-4', title: 'الفحوصات والتقييمات', duration: 17 },
        { id: 'ftb-5', title: 'الإغلاق وما بعده', duration: 14 },
      ],
    },
  ];

  let orderInLevel = 1;
  for (const courseData of coursesData) {
    const course = await prisma.course.upsert({
      where: { id: courseData.id },
      update: {
        title: courseData.title,
        description: courseData.description,
        difficulty: courseData.difficulty,
        category: courseData.category,
        estimatedDurationMinutes: courseData.estimatedDurationMinutes,
        isPublished: true,
      },
      create: {
        id: courseData.id,
        programId: program.id,
        levelId: level.id,
        title: courseData.title,
        description: courseData.description,
        objectives: JSON.stringify([]),
        prerequisites: JSON.stringify([]),
        estimatedDurationMinutes: courseData.estimatedDurationMinutes,
        difficulty: courseData.difficulty,
        category: courseData.category,
        isPublished: true,
        orderInLevel: orderInLevel++,
      },
    });
    console.log('Created/updated course:', course.title);

    // Create lectures for this course
    let orderInCourse = 1;
    for (const lesson of courseData.lessons) {
      await prisma.lecture.upsert({
        where: { id: lesson.id },
        update: {
          title: lesson.title,
          durationMinutes: lesson.duration,
          orderInCourse: orderInCourse,
        },
        create: {
          id: lesson.id,
          courseId: course.id,
          title: lesson.title,
          description: `Lecture: ${lesson.title}`,
          videoUrl: `https://youtube.com/watch?v=${lesson.id}`,
          durationMinutes: lesson.duration,
          orderInCourse: orderInCourse,
          triggerAssessmentOnComplete: true,
        },
      });
      orderInCourse++;
    }
    console.log(`  Created ${courseData.lessons.length} lectures`);
  }

  // Create MacSoft Real Estate Organization
  const macsoftOrg = await prisma.organization.upsert({
    where: { id: 'macsoft-org' },
    update: {
      contactEmail: 'admin@macsoft.com',
    },
    create: {
      id: 'macsoft-org',
      name: 'MacSoft Real Estate',
      type: 'training_company',
      contactEmail: 'admin@macsoft.com',
    },
  });
  console.log('Created MacSoft organization:', macsoftOrg.name);

  // Create only admin user for login - you will add other users manually
  const defaultPassword = await bcrypt.hash('Test1234', 10);

  const adminUser = await prisma.trainee.upsert({
    where: { email: 'admin@macsoft.com' },
    update: {
      role: 'org_admin',
      passwordHash: defaultPassword,
    },
    create: {
      id: 'admin-macsoft',
      email: 'admin@macsoft.com',
      firstName: 'Admin',
      lastName: 'User',
      organizationId: macsoftOrg.id,
      currentLevelId: level.id,
      passwordHash: defaultPassword,
      status: 'active',
      role: 'org_admin',
    },
  });
  console.log('Created admin user:', adminUser.email);

  console.log('\n========================================');
  console.log('Seeding completed!');
  console.log('========================================');
  console.log('Admin account: admin@macsoft.com / Test1234');
  console.log('Add your own users and data manually.');
  console.log('========================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
