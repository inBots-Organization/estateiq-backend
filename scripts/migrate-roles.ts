/**
 * Data Migration Script: Multi-Tenant RBAC Role Migration
 *
 * This script migrates the existing role system to the new multi-tenant RBAC system:
 * - 'admin' -> 'org_admin'
 * - 'user' -> 'trainee'
 *
 * It also creates a default "All Trainees" group for each organization.
 *
 * Usage: npx ts-node scripts/migrate-roles.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateRoles() {
  console.log('Starting role migration...\n');

  // 1. Update roles: admin -> org_admin
  const adminResult = await prisma.trainee.updateMany({
    where: { role: 'admin' },
    data: { role: 'org_admin' },
  });
  console.log(`Updated ${adminResult.count} admin users to org_admin`);

  // 2. Update roles: user -> trainee
  const userResult = await prisma.trainee.updateMany({
    where: { role: 'user' },
    data: { role: 'trainee' },
  });
  console.log(`Updated ${userResult.count} user accounts to trainee`);

  console.log('\nRole migration completed!');
}

async function createDefaultGroups() {
  console.log('\nCreating default groups for each organization...\n');

  const organizations = await prisma.organization.findMany();

  for (const org of organizations) {
    console.log(`Processing organization: ${org.name} (${org.id})`);

    // Check if default group already exists
    const existingGroup = await prisma.traineeGroup.findUnique({
      where: {
        organizationId_name: {
          organizationId: org.id,
          name: 'All Trainees',
        },
      },
    });

    if (existingGroup) {
      console.log(`  - Default group already exists, skipping`);
      continue;
    }

    // Find an org_admin to be the creator
    const admin = await prisma.trainee.findFirst({
      where: {
        organizationId: org.id,
        role: 'org_admin',
      },
    });

    if (!admin) {
      console.log(`  - No org_admin found, skipping group creation`);
      continue;
    }

    // Create the default group
    const group = await prisma.traineeGroup.create({
      data: {
        organizationId: org.id,
        name: 'All Trainees',
        description: 'Default group containing all trainees',
        createdById: admin.id,
      },
    });
    console.log(`  - Created default group: ${group.id}`);

    // Add all trainees to this group
    const trainees = await prisma.trainee.findMany({
      where: {
        organizationId: org.id,
        role: 'trainee',
      },
      select: { id: true },
    });

    if (trainees.length > 0) {
      // Add trainees one by one to handle duplicates gracefully
      let addedCount = 0;
      for (const trainee of trainees) {
        try {
          await prisma.groupMember.create({
            data: {
              groupId: group.id,
              traineeId: trainee.id,
            },
          });
          addedCount++;
        } catch (e) {
          // Ignore duplicate errors
        }
      }
      console.log(`  - Added ${addedCount} trainees to the default group`);
    }
  }

  console.log('\nDefault group creation completed!');
}

async function printSummary() {
  console.log('\n=== Migration Summary ===\n');

  const roleStats = await prisma.trainee.groupBy({
    by: ['role'],
    _count: true,
  });

  console.log('User counts by role:');
  for (const stat of roleStats) {
    console.log(`  - ${stat.role}: ${stat._count}`);
  }

  const groupCount = await prisma.traineeGroup.count();
  console.log(`\nTotal groups: ${groupCount}`);

  const memberCount = await prisma.groupMember.count({ where: { isActive: true as boolean } });
  console.log(`Total group memberships: ${memberCount}`);

  const trainerAssignments = await prisma.trainerGroupAssignment.count({ where: { isActive: true as boolean } });
  console.log(`Total trainer assignments: ${trainerAssignments}`);
}

async function main() {
  console.log('=================================================');
  console.log('Multi-Tenant RBAC Migration Script');
  console.log('=================================================\n');

  try {
    await migrateRoles();
    await createDefaultGroups();
    await printSummary();

    console.log('\n=================================================');
    console.log('Migration completed successfully!');
    console.log('=================================================');
  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
