const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function addInbotsData() {
  const passwordHash = await bcrypt.hash('Test1234', 10);

  // Get the InBots organization
  const inbotsOrg = await prisma.organization.findFirst({
    where: { name: 'InBots' }
  });

  if (!inbotsOrg) {
    console.error('InBots organization not found!');
    return;
  }

  console.log('Found InBots organization:', inbotsOrg.id);

  // Get default level for new users
  const level = await prisma.level.findFirst({ where: { id: 'default-level' } });

  // Get the org admin (mostafa)
  const orgAdmin = await prisma.trainee.findFirst({
    where: { organizationId: inbotsOrg.id, role: 'org_admin' }
  });

  console.log('Found org admin:', orgAdmin?.email);

  // Create trainer
  const trainer = await prisma.trainee.upsert({
    where: { email: 'ali.trainer@inbots.com' },
    update: {},
    create: {
      email: 'ali.trainer@inbots.com',
      firstName: 'علي',
      lastName: 'المدرب',
      role: 'trainer',
      passwordHash: passwordHash,
      organizationId: inbotsOrg.id,
      currentLevelId: level?.id,
      status: 'active'
    }
  });
  console.log('Created trainer:', trainer.email, '-', trainer.firstName, trainer.lastName);

  // Create trainees
  const traineesData = [
    { email: 'omar@inbots.com', firstName: 'عمر', lastName: 'السالم' },
    { email: 'fatima@inbots.com', firstName: 'فاطمة', lastName: 'الخالد' },
    { email: 'khalid@inbots.com', firstName: 'خالد', lastName: 'العمري' },
    { email: 'noura@inbots.com', firstName: 'نورة', lastName: 'البدر' },
    { email: 'youssef@inbots.com', firstName: 'يوسف', lastName: 'الحسن' },
  ];

  const createdTrainees = [];
  for (const data of traineesData) {
    const trainee = await prisma.trainee.upsert({
      where: { email: data.email },
      update: {},
      create: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'trainee',
        passwordHash: passwordHash,
        organizationId: inbotsOrg.id,
        currentLevelId: level?.id,
        status: 'active'
      }
    });
    createdTrainees.push(trainee);
    console.log('Created trainee:', trainee.email, '-', trainee.firstName, trainee.lastName);
  }

  // Create groups
  const groupsData = [
    { name: 'فريق المبيعات', description: 'فريق مبيعات العقارات' },
    { name: 'المتدربين الجدد', description: 'المتدربين الجدد في البرنامج' },
    { name: 'فريق التسويق', description: 'فريق التسويق العقاري' },
  ];

  const createdGroups = [];
  for (const groupData of groupsData) {
    const group = await prisma.traineeGroup.upsert({
      where: {
        organizationId_name: {
          organizationId: inbotsOrg.id,
          name: groupData.name
        }
      },
      update: {},
      create: {
        name: groupData.name,
        description: groupData.description,
        organizationId: inbotsOrg.id,
        createdById: orgAdmin.id,
        isActive: true
      }
    });
    createdGroups.push(group);
    console.log('Created group:', group.name);
  }

  // Assign trainer to groups
  for (const group of createdGroups) {
    await prisma.trainerGroupAssignment.upsert({
      where: {
        groupId_trainerId: {
          groupId: group.id,
          trainerId: trainer.id
        }
      },
      update: {},
      create: {
        groupId: group.id,
        trainerId: trainer.id,
        assignedById: orgAdmin.id,
        isActive: true
      }
    });
    console.log('Assigned trainer to group:', group.name);
  }

  // Add trainees to groups
  // Sales team: Omar, Khalid, Youssef
  const salesGroup = createdGroups[0];
  const salesMembers = createdTrainees.filter(t =>
    ['omar@inbots.com', 'khalid@inbots.com', 'youssef@inbots.com'].includes(t.email)
  );
  for (const member of salesMembers) {
    await prisma.groupMember.upsert({
      where: {
        groupId_traineeId: {
          groupId: salesGroup.id,
          traineeId: member.id
        }
      },
      update: {},
      create: {
        groupId: salesGroup.id,
        traineeId: member.id,
        isActive: true
      }
    });
  }
  console.log('Added members to Sales team');

  // New trainees: Fatima, Noura
  const newTraineesGroup = createdGroups[1];
  const newMembers = createdTrainees.filter(t =>
    ['fatima@inbots.com', 'noura@inbots.com'].includes(t.email)
  );
  for (const member of newMembers) {
    await prisma.groupMember.upsert({
      where: {
        groupId_traineeId: {
          groupId: newTraineesGroup.id,
          traineeId: member.id
        }
      },
      update: {},
      create: {
        groupId: newTraineesGroup.id,
        traineeId: member.id,
        isActive: true
      }
    });
  }
  console.log('Added members to New Trainees group');

  // Marketing team: Fatima, Youssef
  const marketingGroup = createdGroups[2];
  const marketingMembers = createdTrainees.filter(t =>
    ['fatima@inbots.com', 'youssef@inbots.com'].includes(t.email)
  );
  for (const member of marketingMembers) {
    await prisma.groupMember.upsert({
      where: {
        groupId_traineeId: {
          groupId: marketingGroup.id,
          traineeId: member.id
        }
      },
      update: {},
      create: {
        groupId: marketingGroup.id,
        traineeId: member.id,
        isActive: true
      }
    });
  }
  console.log('Added members to Marketing team');

  console.log('\n========================================');
  console.log('InBots data added successfully!');
  console.log('========================================');
  console.log('Organization: InBots');
  console.log('\nAccounts created:');
  console.log('  Trainer: ali.trainer@inbots.com (علي المدرب)');
  console.log('  Trainees:');
  traineesData.forEach(t => console.log(`    - ${t.email} (${t.firstName} ${t.lastName})`));
  console.log('\nGroups created:');
  groupsData.forEach(g => console.log(`  - ${g.name}`));
  console.log('\nAll passwords: Test1234');
  console.log('========================================');

  await prisma.$disconnect();
}

addInbotsData().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
