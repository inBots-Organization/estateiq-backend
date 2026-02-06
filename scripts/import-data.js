const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function importData() {
  console.log('Starting data import to PostgreSQL...\n');

  const dataPath = path.join(__dirname, '..', 'backup-data.json');

  if (!fs.existsSync(dataPath)) {
    console.error('❌ backup-data.json not found!');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  try {
    // Import in correct order (respecting foreign keys)

    // 1. Organizations (no dependencies)
    if (data.organizations?.length > 0) {
      console.log(`Importing ${data.organizations.length} organizations...`);
      for (const org of data.organizations) {
        await prisma.organization.upsert({
          where: { id: org.id },
          update: org,
          create: org,
        });
      }
      console.log('  ✅ Organizations imported');
    }

    // 2. Programs (no dependencies)
    if (data.programs?.length > 0) {
      console.log(`Importing ${data.programs.length} programs...`);
      for (const program of data.programs) {
        await prisma.program.upsert({
          where: { id: program.id },
          update: program,
          create: program,
        });
      }
      console.log('  ✅ Programs imported');
    }

    // 3. Levels (depends on programs)
    if (data.levels?.length > 0) {
      console.log(`Importing ${data.levels.length} levels...`);
      for (const level of data.levels) {
        await prisma.level.upsert({
          where: { id: level.id },
          update: level,
          create: level,
        });
      }
      console.log('  ✅ Levels imported');
    }

    // 4. Trainees (depends on organizations, levels)
    if (data.trainees?.length > 0) {
      console.log(`Importing ${data.trainees.length} trainees...`);
      for (const trainee of data.trainees) {
        await prisma.trainee.upsert({
          where: { id: trainee.id },
          update: trainee,
          create: trainee,
        });
      }
      console.log('  ✅ Trainees imported');
    }

    // 5. Trainee Groups (depends on organizations)
    if (data.traineeGroups?.length > 0) {
      console.log(`Importing ${data.traineeGroups.length} trainee groups...`);
      for (const group of data.traineeGroups) {
        await prisma.traineeGroup.upsert({
          where: { id: group.id },
          update: group,
          create: group,
        });
      }
      console.log('  ✅ Trainee groups imported');
    }

    // 6. Group Members (depends on traineeGroups, trainees)
    if (data.groupMembers?.length > 0) {
      console.log(`Importing ${data.groupMembers.length} group members...`);
      for (const member of data.groupMembers) {
        await prisma.groupMember.upsert({
          where: { id: member.id },
          update: member,
          create: member,
        });
      }
      console.log('  ✅ Group members imported');
    }

    // 7. Trainer Group Assignments
    if (data.trainerGroupAssignments?.length > 0) {
      console.log(`Importing ${data.trainerGroupAssignments.length} trainer assignments...`);
      for (const assignment of data.trainerGroupAssignments) {
        await prisma.trainerGroupAssignment.upsert({
          where: { id: assignment.id },
          update: assignment,
          create: assignment,
        });
      }
      console.log('  ✅ Trainer assignments imported');
    }

    // 8. Courses (depends on programs, levels)
    if (data.courses?.length > 0) {
      console.log(`Importing ${data.courses.length} courses...`);
      for (const course of data.courses) {
        await prisma.course.upsert({
          where: { id: course.id },
          update: course,
          create: course,
        });
      }
      console.log('  ✅ Courses imported');
    }

    // 9. Lectures (depends on courses)
    if (data.lectures?.length > 0) {
      console.log(`Importing ${data.lectures.length} lectures...`);
      for (const lecture of data.lectures) {
        await prisma.lecture.upsert({
          where: { id: lecture.id },
          update: lecture,
          create: lecture,
        });
      }
      console.log('  ✅ Lectures imported');
    }

    // 10. Program Enrollments
    if (data.programEnrollments?.length > 0) {
      console.log(`Importing ${data.programEnrollments.length} program enrollments...`);
      for (const enrollment of data.programEnrollments) {
        await prisma.programEnrollment.upsert({
          where: { id: enrollment.id },
          update: enrollment,
          create: enrollment,
        });
      }
      console.log('  ✅ Program enrollments imported');
    }

    // 11. Lecture Completions
    if (data.lectureCompletions?.length > 0) {
      console.log(`Importing ${data.lectureCompletions.length} lecture completions...`);
      for (const completion of data.lectureCompletions) {
        await prisma.lectureCompletion.upsert({
          where: { id: completion.id },
          update: completion,
          create: completion,
        });
      }
      console.log('  ✅ Lecture completions imported');
    }

    // 12. Assessment Completions
    if (data.assessmentCompletions?.length > 0) {
      console.log(`Importing ${data.assessmentCompletions.length} assessment completions...`);
      for (const completion of data.assessmentCompletions) {
        await prisma.assessmentCompletion.upsert({
          where: { id: completion.id },
          update: completion,
          create: completion,
        });
      }
      console.log('  ✅ Assessment completions imported');
    }

    // 13. Simulation Sessions (depends on trainees)
    if (data.simulationSessions?.length > 0) {
      console.log(`Importing ${data.simulationSessions.length} simulation sessions...`);
      for (const session of data.simulationSessions) {
        await prisma.simulationSession.upsert({
          where: { id: session.id },
          update: session,
          create: session,
        });
      }
      console.log('  ✅ Simulation sessions imported');
    }

    // 14. Conversation Turns (depends on simulation sessions)
    if (data.conversationTurns?.length > 0) {
      console.log(`Importing ${data.conversationTurns.length} conversation turns...`);
      for (const turn of data.conversationTurns) {
        await prisma.conversationTurn.upsert({
          where: { id: turn.id },
          update: turn,
          create: turn,
        });
      }
      console.log('  ✅ Conversation turns imported');
    }

    // 15. Interaction Reports (depends on simulation sessions, trainees)
    if (data.interactionReports?.length > 0) {
      console.log(`Importing ${data.interactionReports.length} interaction reports...`);
      for (const report of data.interactionReports) {
        await prisma.interactionReport.upsert({
          where: { id: report.id },
          update: report,
          create: report,
        });
      }
      console.log('  ✅ Interaction reports imported');
    }

    // 16. Voice Sessions
    if (data.voiceSessions?.length > 0) {
      console.log(`Importing ${data.voiceSessions.length} voice sessions...`);
      for (const session of data.voiceSessions) {
        await prisma.voiceSession.upsert({
          where: { id: session.id },
          update: session,
          create: session,
        });
      }
      console.log('  ✅ Voice sessions imported');
    }

    // 17. Objection Templates
    if (data.objectionTemplates?.length > 0) {
      console.log(`Importing ${data.objectionTemplates.length} objection templates...`);
      for (const template of data.objectionTemplates) {
        await prisma.objectionTemplate.upsert({
          where: { id: template.id },
          update: template,
          create: template,
        });
      }
      console.log('  ✅ Objection templates imported');
    }

    // 18. Trainee Notes
    if (data.traineeNotes?.length > 0) {
      console.log(`Importing ${data.traineeNotes.length} trainee notes...`);
      for (const note of data.traineeNotes) {
        await prisma.traineeNote.upsert({
          where: { id: note.id },
          update: note,
          create: note,
        });
      }
      console.log('  ✅ Trainee notes imported');
    }

    // 19. Notifications
    if (data.notifications?.length > 0) {
      console.log(`Importing ${data.notifications.length} notifications...`);
      for (const notification of data.notifications) {
        await prisma.notification.upsert({
          where: { id: notification.id },
          update: notification,
          create: notification,
        });
      }
      console.log('  ✅ Notifications imported');
    }

    // 20. Subscription Plans
    if (data.subscriptionPlans?.length > 0) {
      console.log(`Importing ${data.subscriptionPlans.length} subscription plans...`);
      for (const plan of data.subscriptionPlans) {
        await prisma.subscriptionPlan.upsert({
          where: { id: plan.id },
          update: plan,
          create: plan,
        });
      }
      console.log('  ✅ Subscription plans imported');
    }

    // 21. Subscriptions
    if (data.subscriptions?.length > 0) {
      console.log(`Importing ${data.subscriptions.length} subscriptions...`);
      for (const subscription of data.subscriptions) {
        await prisma.subscription.upsert({
          where: { id: subscription.id },
          update: subscription,
          create: subscription,
        });
      }
      console.log('  ✅ Subscriptions imported');
    }

    // 22. Invoices
    if (data.invoices?.length > 0) {
      console.log(`Importing ${data.invoices.length} invoices...`);
      for (const invoice of data.invoices) {
        await prisma.invoice.upsert({
          where: { id: invoice.id },
          update: invoice,
          create: invoice,
        });
      }
      console.log('  ✅ Invoices imported');
    }

    // 23. API Usage
    if (data.apiUsage?.length > 0) {
      console.log(`Importing ${data.apiUsage.length} API usage records...`);
      for (const usage of data.apiUsage) {
        await prisma.apiUsage.upsert({
          where: { id: usage.id },
          update: usage,
          create: usage,
        });
      }
      console.log('  ✅ API usage imported');
    }

    // 24. Audit Logs
    if (data.auditLogs?.length > 0) {
      console.log(`Importing ${data.auditLogs.length} audit logs...`);
      for (const log of data.auditLogs) {
        await prisma.auditLog.upsert({
          where: { id: log.id },
          update: log,
          create: log,
        });
      }
      console.log('  ✅ Audit logs imported');
    }

    console.log('\n✅ All data imported successfully to PostgreSQL!');

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importData();
