import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { orgIsolationMiddleware, getAccessibleGroupIds } from '../middleware/rbac.middleware';
import { groupService } from '../services/group/group.service';
import { UserRole } from '../services/interfaces/auth.interface';

const router = Router();

// All routes require authentication and org isolation
router.use(authMiddleware(['trainer', 'org_admin']));
router.use(orgIsolationMiddleware());

/**
 * GET /api/groups
 * List all groups (filtered by access for trainers)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get accessible groups based on role
    const accessibleGroupIds = await getAccessibleGroupIds(
      user.userId,
      user.role as UserRole,
      organizationId
    );

    const groups = await groupService.getGroups(organizationId, accessibleGroupIds);

    return res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

/**
 * GET /api/groups/available-trainees
 * Get trainees available to add to groups
 */
router.get('/available-trainees', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trainees = await groupService.getAvailableTrainees(organizationId);

    return res.json({ trainees });
  } catch (error) {
    console.error('Error fetching available trainees:', error);
    return res.status(500).json({ error: 'Failed to fetch trainees' });
  }
});

/**
 * GET /api/groups/available-trainers
 * Get trainers available to assign to groups
 */
router.get('/available-trainers', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const trainers = await groupService.getAvailableTrainers(organizationId);

    return res.json({ trainers });
  } catch (error) {
    console.error('Error fetching available trainers:', error);
    return res.status(500).json({ error: 'Failed to fetch trainers' });
  }
});

/**
 * GET /api/groups/:id
 * Get group details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { id } = req.params;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // For trainers, verify they have access to this group
    if (user.role === 'trainer') {
      const accessibleGroupIds = await getAccessibleGroupIds(
        user.userId,
        'trainer',
        organizationId
      );

      if (accessibleGroupIds !== 'all' && !accessibleGroupIds.includes(id)) {
        return res.status(403).json({ error: 'Access denied to this group' });
      }
    }

    const group = await groupService.getGroupById(id, organizationId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    return res.json({ group });
  } catch (error) {
    console.error('Error fetching group:', error);
    return res.status(500).json({ error: 'Failed to fetch group' });
  }
});

/**
 * POST /api/groups
 * Create a new group (org_admin only)
 */
router.post('/', authMiddleware(['org_admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { name, description } = req.body;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await groupService.createGroup({
      organizationId,
      name: name.trim(),
      description: description?.trim(),
      createdById: user.userId,
    });

    return res.status(201).json({ group });
  } catch (error: any) {
    console.error('Error creating group:', error);
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

/**
 * PATCH /api/groups/:id
 * Update a group (org_admin only)
 */
router.patch('/:id', authMiddleware(['org_admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { name, description, isActive } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;

    const group = await groupService.updateGroup(id, organizationId, updateData);

    return res.json({ group });
  } catch (error: any) {
    console.error('Error updating group:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to update group' });
  }
});

/**
 * DELETE /api/groups/:id
 * Delete a group (org_admin only)
 */
router.delete('/:id', authMiddleware(['org_admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await groupService.deleteGroup(id, organizationId);

    return res.json({ success: true, message: 'Group deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting group:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to delete group' });
  }
});

/**
 * POST /api/groups/:id/members
 * Add trainees to a group (org_admin only)
 */
router.post('/:id/members', authMiddleware(['org_admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId } = req;
    const { id } = req.params;
    const { traineeIds } = req.body;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!Array.isArray(traineeIds) || traineeIds.length === 0) {
      return res.status(400).json({ error: 'traineeIds must be a non-empty array' });
    }

    const result = await groupService.addMembers(id, traineeIds, organizationId);

    return res.json({
      success: true,
      message: `Added ${result.added} members, skipped ${result.skipped} duplicates`,
      ...result,
    });
  } catch (error: any) {
    console.error('Error adding members:', error);
    if (error.message === 'Group not found') {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

/**
 * DELETE /api/groups/:id/members/:memberId
 * Remove a trainee from a group (org_admin only)
 */
router.delete(
  '/:id/members/:memberId',
  authMiddleware(['org_admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, memberId } = req.params;

      if (!organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await groupService.removeMember(id, memberId, organizationId);

      return res.json({ success: true, message: 'Member removed successfully' });
    } catch (error: any) {
      console.error('Error removing member:', error);
      if (error.message === 'Group not found' || error.message?.includes('not a member')) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to remove member' });
    }
  }
);

/**
 * POST /api/groups/:id/trainers
 * Assign a trainer to a group (org_admin only)
 */
router.post('/:id/trainers', authMiddleware(['org_admin']), async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req;
    const { id } = req.params;
    const { trainerId } = req.body;

    if (!organizationId || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!trainerId) {
      return res.status(400).json({ error: 'trainerId is required' });
    }

    const assignment = await groupService.assignTrainer(
      id,
      trainerId,
      user.userId,
      organizationId
    );

    return res.status(201).json({ assignment });
  } catch (error: any) {
    console.error('Error assigning trainer:', error);
    if (error.message === 'Group not found' || error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    if (error.message?.includes('already assigned')) {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to assign trainer' });
  }
});

/**
 * DELETE /api/groups/:id/trainers/:trainerId
 * Unassign a trainer from a group (org_admin only)
 */
router.delete(
  '/:id/trainers/:trainerId',
  authMiddleware(['org_admin']),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req;
      const { id, trainerId } = req.params;

      if (!organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await groupService.unassignTrainer(id, trainerId, organizationId);

      return res.json({ success: true, message: 'Trainer unassigned successfully' });
    } catch (error: any) {
      console.error('Error unassigning trainer:', error);
      if (error.message === 'Group not found' || error.message?.includes('not assigned')) {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to unassign trainer' });
    }
  }
);

export default router;
