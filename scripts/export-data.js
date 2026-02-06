const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function exportData() {
  console.log('Starting data export from SQLite...\n');

  try {
    const data = {};

    // Export all tables - using correct model names from schema
    console.log('Exporting organizations...');
    data.organizations = await prisma.organization.findMany();
    console.log(`  Found ${data.organizations.length} organizations`);

    console.log('Exporting trainees (users)...');
    data.trainees = await prisma.trainee.findMany();
    console.log(`  Found ${data.trainees.length} trainees`);

    console.log('Exporting trainee groups...');
    data.traineeGroups = await prisma.traineeGroup.findMany();
    console.log(`  Found ${data.traineeGroups.length} trainee groups`);

    console.log('Exporting group members...');
    data.groupMembers = await prisma.groupMember.findMany();
    console.log(`  Found ${data.groupMembers.length} group members`);

    console.log('Exporting trainer group assignments...');
    data.trainerGroupAssignments = await prisma.trainerGroupAssignment.findMany();
    console.log(`  Found ${data.trainerGroupAssignments.length} trainer assignments`);

    console.log('Exporting programs...');
    data.programs = await prisma.program.findMany();
    console.log(`  Found ${data.programs.length} programs`);

    console.log('Exporting levels...');
    data.levels = await prisma.level.findMany();
    console.log(`  Found ${data.levels.length} levels`);

    console.log('Exporting courses...');
    data.courses = await prisma.course.findMany();
    console.log(`  Found ${data.courses.length} courses`);

    console.log('Exporting lectures...');
    data.lectures = await prisma.lecture.findMany();
    console.log(`  Found ${data.lectures.length} lectures`);

    console.log('Exporting program enrollments...');
    data.programEnrollments = await prisma.programEnrollment.findMany();
    console.log(`  Found ${data.programEnrollments.length} program enrollments`);

    console.log('Exporting lecture completions...');
    data.lectureCompletions = await prisma.lectureCompletion.findMany();
    console.log(`  Found ${data.lectureCompletions.length} lecture completions`);

    console.log('Exporting assessment completions...');
    data.assessmentCompletions = await prisma.assessmentCompletion.findMany();
    console.log(`  Found ${data.assessmentCompletions.length} assessment completions`);

    console.log('Exporting simulation sessions...');
    data.simulationSessions = await prisma.simulationSession.findMany();
    console.log(`  Found ${data.simulationSessions.length} simulation sessions`);

    console.log('Exporting conversation turns...');
    data.conversationTurns = await prisma.conversationTurn.findMany();
    console.log(`  Found ${data.conversationTurns.length} conversation turns`);

    console.log('Exporting interaction reports...');
    data.interactionReports = await prisma.interactionReport.findMany();
    console.log(`  Found ${data.interactionReports.length} interaction reports`);

    console.log('Exporting voice sessions...');
    data.voiceSessions = await prisma.voiceSession.findMany();
    console.log(`  Found ${data.voiceSessions.length} voice sessions`);

    console.log('Exporting objection templates...');
    data.objectionTemplates = await prisma.objectionTemplate.findMany();
    console.log(`  Found ${data.objectionTemplates.length} objection templates`);

    console.log('Exporting trainee notes...');
    data.traineeNotes = await prisma.traineeNote.findMany();
    console.log(`  Found ${data.traineeNotes.length} trainee notes`);

    console.log('Exporting notifications...');
    data.notifications = await prisma.notification.findMany();
    console.log(`  Found ${data.notifications.length} notifications`);

    console.log('Exporting subscription plans...');
    data.subscriptionPlans = await prisma.subscriptionPlan.findMany();
    console.log(`  Found ${data.subscriptionPlans.length} subscription plans`);

    console.log('Exporting subscriptions...');
    data.subscriptions = await prisma.subscription.findMany();
    console.log(`  Found ${data.subscriptions.length} subscriptions`);

    console.log('Exporting invoices...');
    data.invoices = await prisma.invoice.findMany();
    console.log(`  Found ${data.invoices.length} invoices`);

    console.log('Exporting API usage...');
    data.apiUsage = await prisma.apiUsage.findMany();
    console.log(`  Found ${data.apiUsage.length} API usage records`);

    console.log('Exporting audit logs...');
    data.auditLogs = await prisma.auditLog.findMany();
    console.log(`  Found ${data.auditLogs.length} audit logs`);

    // Save to file
    const outputPath = path.join(__dirname, '..', 'backup-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log('\n✅ Data exported successfully!');
    console.log(`📁 Saved to: ${outputPath}`);

    // Summary
    const totalRecords = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`\n📊 Total records exported: ${totalRecords}`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

exportData();
