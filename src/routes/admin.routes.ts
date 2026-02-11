import { Router, Request, Response } from 'express';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth.middleware';
import { IAdminService, TrainerScope } from '../services/interfaces/admin.interface';
import { ITraineeRepository } from '../repositories/interfaces/trainee.repository.interface';

const router = Router();

// All admin routes require authentication with admin, org_admin, or trainer role
// The auth middleware handles role normalization (admin -> org_admin)
// Note: Trainers can view but only org_admin can modify users
router.use(authMiddleware(['admin', 'org_admin', 'trainer']));

// Helper function to get organization ID (supports impersonation)
async function getOrganizationId(req: Request): Promise<string | null> {
  // For impersonating super admins, use the impersonated org from request
  if (req.organizationId) {
    return req.organizationId;
  }

  // Fallback to user's organization (for regular admins/trainers)
  const traineeRepo = container.resolve<ITraineeRepository>('TraineeRepository');
  const user = await traineeRepo.findById(req.user!.userId);
  return user?.organizationId || null;
}

// Helper function to get trainer scope if user is a trainer
function getTrainerScope(req: Request): TrainerScope | undefined {
  // Check if user is a trainer (not org_admin)
  // originalRole is set by middleware for impersonating super admins
  const effectiveRole = req.user?.originalRole || req.user?.role;

  if (effectiveRole === 'trainer') {
    return {
      trainerId: req.user!.userId,
      role: 'trainer',
    };
  }

  return undefined;
}

// GET /api/admin/dashboard - Get full admin dashboard data
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable (filters data to trainer's groups only)
    const trainerScope = getTrainerScope(req);

    const dashboard = await adminService.getDashboardData(organizationId, trainerScope);

    // Add role info to response so frontend knows to adjust UI
    res.json({
      ...dashboard,
      userRole: req.user?.originalRole || req.user?.role,
      isTrainerView: !!trainerScope,
    });
  } catch (error) {
    console.error('Error fetching admin dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/admin/overview - Get overview statistics only
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    const overview = await adminService.getOverviewStats(organizationId, trainerScope);
    res.json(overview);
  } catch (error) {
    console.error('Error fetching overview stats:', error);
    res.status(500).json({ error: 'Failed to fetch overview statistics' });
  }
});

// GET /api/admin/team-performance - Get team performance metrics
router.get('/team-performance', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    const performance = await adminService.getTeamPerformance(organizationId, trainerScope);
    res.json(performance);
  } catch (error) {
    console.error('Error fetching team performance:', error);
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
});

// GET /api/admin/trends - Get monthly trends
router.get('/trends', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    const months = parseInt(req.query.months as string) || 6;
    const trends = await adminService.getMonthlyTrends(organizationId, months, trainerScope);
    res.json(trends);
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// POST /api/admin/employees - Create a new employee (trainee or trainer)
router.post('/employees', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Only org_admin can create employees
    if (req.user!.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only organization admins can create employees' });
    }

    const { firstName, lastName, email, password, role, groupId } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'First name, last name, email, and password are required' });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Validate role - org_admin cannot create another org_admin or super_admin
    const allowedRoles = ['trainee', 'trainer'];
    const userRole = role || 'trainee';
    if (!allowedRoles.includes(userRole)) {
      return res.status(400).json({
        error: 'Invalid role. Org admins can only create "trainee" or "trainer" accounts'
      });
    }

    // Check if email is already in use
    const existingUser = await prisma.trainee.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create the new user
    const newUser = await prisma.trainee.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash,
        role: userRole,
        organizationId,
        status: 'active',
        currentStreak: 0,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    // If groupId provided, add user to that group
    if (groupId) {
      // Verify the group exists and belongs to the same organization
      const group = await prisma.traineeGroup.findFirst({
        where: { id: groupId, organizationId },
      });

      if (group) {
        if (userRole === 'trainee') {
          // Add as group member
          await prisma.groupMember.create({
            data: {
              groupId,
              traineeId: newUser.id,
              isActive: true,
            },
          });
        } else if (userRole === 'trainer') {
          // Add as trainer assignment
          await prisma.trainerGroupAssignment.create({
            data: {
              groupId,
              trainerId: newUser.id,
              assignedById: req.user!.userId,
              isActive: true,
            },
          });
        }
      }
    }

    res.status(201).json({
      message: 'Employee created successfully',
      employee: newUser,
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// GET /api/admin/employees - Get employee list with pagination and search
router.get('/employees', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    const options = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sortBy: (req.query.sortBy as string) || 'lastName',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      search: req.query.search as string,
      trainerScope,
    };

    const result = await adminService.getEmployeeList(organizationId, options);
    res.json({
      ...result,
      isTrainerView: !!trainerScope,
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employee list' });
  }
});

// GET /api/admin/employees/:id - Get detailed employee information
router.get('/employees/:id', async (req: Request, res: Response) => {
  try {
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    const employee = await adminService.getEmployeeDetail(req.params.id, organizationId, trainerScope);
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee detail:', error);
    if ((error as Error).message === 'Employee not found') {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if ((error as Error).message.includes('Access denied')) {
      return res.status(403).json({ error: (error as Error).message });
    }
    res.status(500).json({ error: 'Failed to fetch employee details' });
  }
});

// PATCH /api/admin/employees/:id/role - Update employee role
router.patch('/employees/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;

    // Accept both old and new role names
    const validRoles = ['user', 'admin', 'trainee', 'trainer', 'org_admin'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "trainee", "trainer", or "org_admin"' });
    }

    const adminService = container.resolve<IAdminService>('AdminService');

    await adminService.updateEmployeeRole(req.params.id, role, req.user!.userId);

    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Error updating employee role:', error);
    if ((error as Error).message === 'Employee not found') {
      return res.status(404).json({ error: 'Employee not found' });
    }
    if ((error as Error).message === 'Cannot remove your own admin privileges') {
      return res.status(400).json({ error: (error as Error).message });
    }
    res.status(500).json({ error: 'Failed to update employee role' });
  }
});

// PATCH /api/admin/employees/:id - Update employee details (name, email, role)
router.patch('/employees/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Only org_admin can update employees (impersonating super admin has org_admin role)
    if (req.user!.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only organization admins can update employee details' });
    }

    const { id } = req.params;
    const { firstName, lastName, email, role } = req.body;

    // Verify employee exists and belongs to same organization
    const employee = await prisma.trainee.findFirst({
      where: { id, organizationId },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Prevent admin from demoting themselves
    if (id === req.user!.userId && role && role !== 'org_admin') {
      return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
    }

    // Check if email is being changed and if it's already in use
    if (email && email !== employee.email) {
      const existingUser = await prisma.trainee.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['trainee', 'trainer', 'org_admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be "trainee", "trainer", or "org_admin"' });
      }
    }

    // Update the employee
    const updateData: { firstName?: string; lastName?: string; email?: string; role?: string } = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (role) updateData.role = role;

    const updatedEmployee = await prisma.trainee.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
      },
    });

    res.json({ message: 'Employee updated successfully', employee: updatedEmployee });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

// PATCH /api/admin/employees/:id/status - Suspend or activate an employee
router.patch('/employees/:id/status', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Only org_admin can change status (impersonating super admin has org_admin role)
    if (req.user!.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only organization admins can change employee status' });
    }

    const { id } = req.params;
    const { status, reason } = req.body;

    // Validate status
    if (!status || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "suspended"' });
    }

    // Verify employee exists and belongs to same organization
    const employee = await prisma.trainee.findFirst({
      where: { id, organizationId },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Prevent admin from suspending themselves
    if (id === req.user!.userId) {
      return res.status(400).json({ error: 'Cannot change your own account status' });
    }

    // Update the status
    const updateData: { status: string; suspendedAt?: Date | null; suspendedBy?: string | null; suspensionReason?: string | null } = {
      status,
    };

    if (status === 'suspended') {
      updateData.suspendedAt = new Date();
      updateData.suspendedBy = req.user!.userId;
      updateData.suspensionReason = reason || null;
    } else {
      updateData.suspendedAt = null;
      updateData.suspendedBy = null;
      updateData.suspensionReason = null;
    }

    const updatedEmployee = await prisma.trainee.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        suspendedAt: true,
        suspensionReason: true,
      },
    });

    res.json({
      message: status === 'suspended' ? 'Employee suspended' : 'Employee activated',
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error('Error updating employee status:', error);
    res.status(500).json({ error: 'Failed to update employee status' });
  }
});

// PATCH /api/admin/employees/:id/assign-teacher - Assign AI teacher to employee
router.patch('/employees/:id/assign-teacher', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Only org_admin can assign teachers (impersonating super admin has org_admin role)
    if (req.user!.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only organization admins can assign teachers' });
    }

    const { id } = req.params;
    const { teacherId } = req.body;

    // Verify employee exists and belongs to same organization
    const employee = await prisma.trainee.findFirst({
      where: { id, organizationId },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // If teacherId is null, unassign the teacher
    if (teacherId === null) {
      const updatedEmployee = await prisma.trainee.update({
        where: { id },
        data: {
          assignedTeacherId: null,
          assignedTeacher: null,
          assignedTeacherAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          assignedTeacherId: true,
        },
      });
      return res.json({ message: 'Teacher unassigned successfully', employee: updatedEmployee });
    }

    // Verify teacher exists and belongs to same organization
    const teacher = await prisma.aITeacher.findFirst({
      where: { id: teacherId, organizationId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'AI Teacher not found' });
    }

    // Assign the teacher
    const updatedEmployee = await prisma.trainee.update({
      where: { id },
      data: {
        assignedTeacherId: teacher.id,
        assignedTeacher: teacher.name,
        assignedTeacherAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        assignedTeacherId: true,
        assignedTeacher: true,
        assignedTeacherAt: true,
      },
    });

    res.json({
      message: 'Teacher assigned successfully',
      employee: updatedEmployee,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        displayNameAr: teacher.displayNameAr,
        displayNameEn: teacher.displayNameEn,
      },
    });
  } catch (error) {
    console.error('Error assigning teacher:', error);
    res.status(500).json({ error: 'Failed to assign teacher' });
  }
});

// DELETE /api/admin/employees/:id - Delete an employee
router.delete('/employees/:id', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Only org_admin can delete employees (impersonating super admin has org_admin role)
    if (req.user!.role !== 'org_admin') {
      return res.status(403).json({ error: 'Only organization admins can delete employees' });
    }

    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user!.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Verify employee exists and belongs to same organization
    const employee = await prisma.trainee.findFirst({
      where: { id, organizationId },
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Delete related data first (cascade delete)
    await prisma.$transaction(async (tx) => {
      // Delete group memberships
      await tx.groupMember.deleteMany({ where: { traineeId: id } });

      // Delete trainer assignments if they're a trainer
      await tx.trainerGroupAssignment.deleteMany({ where: { trainerId: id } });

      // Delete notifications
      await tx.notification.deleteMany({ where: { OR: [{ recipientId: id }, { senderId: id }] } });

      // Delete notes
      await tx.traineeNote.deleteMany({ where: { OR: [{ traineeId: id }, { authorId: id }] } });

      // Delete voice sessions
      await tx.voiceSession.deleteMany({ where: { traineeId: id } });

      // Delete conversation turns from simulation sessions
      const sessions = await tx.simulationSession.findMany({
        where: { traineeId: id },
        select: { id: true },
      });
      const sessionIds = sessions.map(s => s.id);

      if (sessionIds.length > 0) {
        await tx.conversationTurn.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.interactionReport.deleteMany({ where: { traineeId: id } });
      }

      // Delete simulation sessions
      await tx.simulationSession.deleteMany({ where: { traineeId: id } });

      // Delete program enrollments
      await tx.programEnrollment.deleteMany({ where: { traineeId: id } });

      // Delete lecture completions
      await tx.lectureCompletion.deleteMany({ where: { traineeId: id } });

      // Delete assessment completions
      await tx.assessmentCompletion.deleteMany({ where: { traineeId: id } });

      // Delete quiz responses first (they reference quiz attempts)
      const quizAttempts = await tx.quizAttempt.findMany({
        where: { traineeId: id },
        select: { id: true },
      });
      const attemptIds = quizAttempts.map(a => a.id);
      if (attemptIds.length > 0) {
        await tx.quizResponse.deleteMany({ where: { attemptId: { in: attemptIds } } });
      }
      // Delete quiz attempts
      await tx.quizAttempt.deleteMany({ where: { traineeId: id } });

      // Delete flashcard proficiencies
      await tx.cardProficiency.deleteMany({ where: { traineeId: id } });

      // Delete AV content and feedback
      const avContents = await tx.aVContent.findMany({
        where: { traineeId: id },
        select: { id: true },
      });
      const avContentIds = avContents.map(c => c.id);
      if (avContentIds.length > 0) {
        await tx.aVSlide.deleteMany({ where: { contentId: { in: avContentIds } } });
        await tx.aVFeedback.deleteMany({ where: { contentId: { in: avContentIds } } });
      }
      await tx.aVContent.deleteMany({ where: { traineeId: id } });
      // Also delete any feedback this user left on others' content
      await tx.aVFeedback.deleteMany({ where: { traineeId: id } });

      // Delete diagnostic sessions and daily skill reports
      await tx.dailySkillReport.deleteMany({ where: { traineeId: id } });
      await tx.diagnosticSession.deleteMany({ where: { traineeId: id } });

      // Delete brain documents uploaded by this user (chunks cascade automatically)
      const brainDocs = await tx.brainDocument.findMany({
        where: { uploadedBy: id },
        select: { id: true },
      });
      const brainDocIds = brainDocs.map(d => d.id);
      if (brainDocIds.length > 0) {
        await tx.brainChunk.deleteMany({ where: { documentId: { in: brainDocIds } } });
        await tx.brainDocument.deleteMany({ where: { uploadedBy: id } });
      }

      // Finally delete the employee
      await tx.trainee.delete({ where: { id } });
    });

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// GET /api/admin/trainee/:traineeId/simulations - Get text chat simulations for a specific trainee
router.get('/trainee/:traineeId/simulations', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { traineeId } = req.params;

    // Get simulation sessions for the specific trainee
    const sessions = await prisma.simulationSession.findMany({
      where: { traineeId },
      include: {
        conversationTurns: {
          orderBy: { turnNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      traineeId: session.traineeId,
      scenarioType: session.scenarioType,
      difficultyLevel: session.difficultyLevel,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationSeconds: session.durationSeconds,
      outcome: session.outcome,
      metrics: session.metrics,
      conversationTurns: session.conversationTurns.map(turn => ({
        id: turn.id,
        speaker: turn.speaker,
        message: turn.message,
        timestamp: turn.timestamp,
        sentiment: turn.sentiment,
      })),
    }));

    res.json({ sessions: formattedSessions });
  } catch (error) {
    console.error('Error fetching trainee simulations:', error);
    res.status(500).json({ error: 'Failed to fetch simulations' });
  }
});

// GET /api/admin/voice-sessions - Get all voice sessions for all trainees
router.get('/voice-sessions', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get trainees in this organization first
    const orgTrainees = await prisma.trainee.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const orgTraineeIds = orgTrainees.map(t => t.id);

    // Get voice sessions only for trainees in this organization
    const [sessions, total] = await Promise.all([
      prisma.voiceSession.findMany({
        where: { traineeId: { in: orgTraineeIds } },
        orderBy: { startTime: 'desc' },
        skip,
        take: limit,
      }),
      prisma.voiceSession.count({
        where: { traineeId: { in: orgTraineeIds } },
      }),
    ]);

    // Get trainee info for each session
    const traineeIds = [...new Set(sessions.map(s => s.traineeId))];
    const trainees = await prisma.trainee.findMany({
      where: { id: { in: traineeIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const traineeMap = new Map(trainees.map(t => [t.id, t]));

    const sessionsWithTrainee = sessions.map(session => {
      const trainee = traineeMap.get(session.traineeId);
      return {
        id: session.id,
        conversationId: session.conversationId,
        traineeId: session.traineeId,
        traineeName: trainee ? `${trainee.firstName} ${trainee.lastName}` : 'Unknown',
        traineeEmail: trainee?.email || '',
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.durationSeconds || 0,
        overallScore: session.overallScore || 0,
        status: session.status,
        hasAudio: !!session.audioBase64,
      };
    });

    res.json({
      sessions: sessionsWithTrainee,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching voice sessions:', error);
    res.status(500).json({ error: 'Failed to fetch voice sessions' });
  }
});

// GET /api/admin/trainee/:traineeId/voice-sessions - Get voice sessions for a specific trainee
router.get('/trainee/:traineeId/voice-sessions', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { traineeId } = req.params;

    // Get voice sessions for the specific trainee
    const sessions = await prisma.voiceSession.findMany({
      where: { traineeId },
      orderBy: { startTime: 'desc' },
      take: 50,
    });

    const formattedSessions = sessions.map(session => ({
      id: session.id,
      conversationId: session.conversationId,
      traineeId: session.traineeId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.durationSeconds || 0,
      durationSeconds: session.durationSeconds || 0,
      overallScore: session.overallScore || 0,
      status: session.status,
      analysis: session.analysis,
      transcript: session.transcript,
      hasAudio: !!session.audioBase64,
    }));

    res.json({ sessions: formattedSessions });
  } catch (error) {
    console.error('Error fetching trainee voice sessions:', error);
    res.status(500).json({ error: 'Failed to fetch voice sessions' });
  }
});

// GET /api/admin/trainee/:traineeId/reports - Get reports for a specific trainee (admin access)
router.get('/trainee/:traineeId/reports', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');
    const adminService = container.resolve<IAdminService>('AdminService');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { traineeId } = req.params;

    // Get trainer scope if applicable - verify trainer has access to this trainee
    const trainerScope = getTrainerScope(req);
    if (trainerScope) {
      const traineeIds = await adminService.getTrainerTraineeIds(trainerScope.trainerId, organizationId);
      if (!traineeIds.includes(traineeId)) {
        return res.status(403).json({ error: 'Access denied: Trainee not in your assigned groups' });
      }
    }

    // Verify trainee exists and is in the same organization
    const trainee = await prisma.trainee.findFirst({
      where: { id: traineeId, organizationId },
    });

    if (!trainee) {
      return res.status(404).json({ error: 'Trainee not found' });
    }

    // Return trainee ID - the frontend will use this to redirect to the reports page
    res.json({
      traineeId: trainee.id,
      firstName: trainee.firstName,
      lastName: trainee.lastName,
      email: trainee.email,
    });
  } catch (error) {
    console.error('Error fetching trainee reports access:', error);
    res.status(500).json({ error: 'Failed to fetch trainee data' });
  }
});

// GET /api/admin/groups - Get groups (filtered by trainer if applicable)
router.get('/groups', async (req: Request, res: Response) => {
  try {
    const prisma = container.resolve<PrismaClient>('PrismaClient');

    // Get organization ID (supports impersonation)
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Get trainer scope if applicable
    const trainerScope = getTrainerScope(req);

    // Define the include options for groups
    const groupInclude = {
      members: {
        include: {
          trainee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
            },
          },
        },
      },
      trainerAssignments: {
        include: {
          trainer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    };

    interface GroupWithRelations {
      id: string;
      name: string;
      description: string | null;
      organizationId: string;
      createdAt: Date;
      members: Array<{
        trainee: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          status: string;
        };
      }>;
      trainerAssignments: Array<{
        trainer: {
          id: string;
          firstName: string;
          lastName: string;
          email: string;
        };
      }>;
    }

    let groups: GroupWithRelations[];

    if (trainerScope) {
      // Get only groups assigned to this trainer
      const trainerAssignments = await prisma.trainerGroupAssignment.findMany({
        where: { trainerId: trainerScope.trainerId },
        include: {
          group: {
            include: groupInclude,
          },
        },
      });

      groups = trainerAssignments
        .map(a => a.group as GroupWithRelations)
        .filter(g => g.organizationId === organizationId);
    } else {
      // Admin gets all groups
      groups = await prisma.traineeGroup.findMany({
        where: { organizationId },
        include: groupInclude,
      }) as GroupWithRelations[];
    }

    const formattedGroups = groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group.members.length,
      members: group.members.map(m => m.trainee),
      trainers: group.trainerAssignments.map(a => a.trainer),
      createdAt: group.createdAt,
    }));

    res.json({
      groups: formattedGroups,
      isTrainerView: !!trainerScope,
      canCreateGroups: !trainerScope, // Only admins can create groups
      canDeleteGroups: !trainerScope, // Only admins can delete groups
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// GET /api/admin/role-info - Get current user's role info for UI adjustments
router.get('/role-info', async (req: Request, res: Response) => {
  try {
    const organizationId = await getOrganizationId(req);
    const trainerScope = getTrainerScope(req);

    res.json({
      role: req.user?.originalRole || req.user?.role,
      isTrainer: !!trainerScope,
      isOrgAdmin: req.user?.role === 'org_admin',
      organizationId,
      permissions: {
        canViewAllEmployees: !trainerScope,
        canCreateGroups: !trainerScope,
        canDeleteGroups: !trainerScope,
        canManageTrainers: !trainerScope,
        canManageAdmins: !trainerScope,
        canViewOrgWideStats: !trainerScope,
        canModifyEmployees: req.user?.role === 'org_admin',
      },
    });
  } catch (error) {
    console.error('Error fetching role info:', error);
    res.status(500).json({ error: 'Failed to fetch role info' });
  }
});

export default router;
