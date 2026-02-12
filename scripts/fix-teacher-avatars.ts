/**
 * Script to fix ALL teacher avatar URLs in database
 * This converts base64 avatars to static URLs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Static avatar URLs (Vercel deployment)
const AVATAR_BASE_URL = 'https://estateiq-app.vercel.app/avatars';

// Map teacher names to their avatar filenames
const AVATAR_URLS: Record<string, string> = {
  firas: `${AVATAR_BASE_URL}/firas.webp`,
  ahmed: `${AVATAR_BASE_URL}/ahmed.png`,
  noura: `${AVATAR_BASE_URL}/noura.png`,
  anas: `${AVATAR_BASE_URL}/anas.png`,
  abdullah: `${AVATAR_BASE_URL}/abdullah.png`,
};

async function main() {
  console.log('Fixing ALL teacher avatars in database...\n');

  // Find all teachers with base64 avatars
  const teachersWithBase64 = await prisma.aITeacher.findMany({
    where: {
      avatarUrl: { startsWith: 'data:' },
    },
    select: {
      id: true,
      name: true,
      organizationId: true,
      avatarUrl: true,
    },
  });

  console.log(`Found ${teachersWithBase64.length} teacher(s) with base64 avatars\n`);

  for (const teacher of teachersWithBase64) {
    const staticUrl = AVATAR_URLS[teacher.name] || `${AVATAR_BASE_URL}/${teacher.name}.webp`;

    console.log(`- ${teacher.name} (${teacher.id})`);
    console.log(`  Org: ${teacher.organizationId}`);
    console.log(`  Updating to: ${staticUrl}`);

    await prisma.aITeacher.update({
      where: { id: teacher.id },
      data: { avatarUrl: staticUrl },
    });
    console.log(`  ✅ Done\n`);
  }

  // Verify all teachers now have URL avatars
  const remaining = await prisma.aITeacher.count({
    where: {
      avatarUrl: { startsWith: 'data:' },
    },
  });

  if (remaining > 0) {
    console.log(`\n⚠️  ${remaining} teacher(s) still have base64 avatars`);
  } else {
    console.log('\n✅ All teachers now have URL-based avatars!');
  }

  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
