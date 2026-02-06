import { PrismaClient, TraineeGroup, GroupMember, TrainerGroupAssignment } from '@prisma/client';

const prisma = new PrismaClient();

// Types for group operations
export interface CreateGroupInput {
  organizationId: string;
  name: string;
  description?: string;
  createdById: string;
}

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface GroupWithDetails extends TraineeGroup {
  members: {
    id: string;
    trainee: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
    };
    joinedAt: Date;
    isActive: boolean;
  }[];
  trainerAssignments: {
    id: string;
    trainer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    assignedAt: Date;
    isActive: boolean;
  }[];
  _count: {
    members: number;
    trainerAssignments: number;
  };
}

export interface GroupListItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  memberCount: number;
  trainerCount: number;
  trainers: {
    id: string;
    firstName: string;
    lastName: string;
  }[];
}

export class GroupService {
  /**
   * Create a new group
   */
  async createGroup(input: CreateGroupInput): Promise<TraineeGroup> {
    // Check if group name already exists in organization
    const existing = await prisma.traineeGroup.findUnique({
      where: {
        organizationId_name: {
          organizationId: input.organizationId,
          name: input.name,
        },
      },
    });

    if (existing) {
      throw new Error('A group with this name already exists in your organization');
    }

    return prisma.traineeGroup.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        createdById: input.createdById,
      },
    });
  }

  /**
   * Get all groups for an organization
   * If groupIds is provided, filter to only those groups (for trainers)
   */
  async getGroups(
    organizationId: string,
    groupIds?: string[] | 'all'
  ): Promise<GroupListItem[]> {
    const where: any = { organizationId };

    // If specific group IDs provided, filter to those
    if (groupIds && groupIds !== 'all') {
      where.id = { in: groupIds };
    }

    const groups = await prisma.traineeGroup.findMany({
      where,
      include: {
        members: {
          where: { isActive: true },
          select: { id: true },
        },
        trainerAssignments: {
          where: { isActive: true },
          include: {
            trainer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      isActive: group.isActive,
      createdAt: group.createdAt,
      memberCount: group.members.length,
      trainerCount: group.trainerAssignments.length,
      trainers: group.trainerAssignments.map((a) => a.trainer),
    }));
  }

  /**
   * Get a group by ID with full details
   */
  async getGroupById(groupId: string, organizationId: string): Promise<GroupWithDetails | null> {
    const group = await prisma.traineeGroup.findFirst({
      where: {
        id: groupId,
        organizationId,
      },
      include: {
        members: {
          include: {
            trainee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
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
          orderBy: { assignedAt: 'desc' },
        },
        _count: {
          select: {
            members: true,
            trainerAssignments: true,
          },
        },
      },
    });

    return group as GroupWithDetails | null;
  }

  /**
   * Update a group
   */
  async updateGroup(
    groupId: string,
    organizationId: string,
    input: UpdateGroupInput
  ): Promise<TraineeGroup> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Check for name conflict if name is being changed
    if (input.name && input.name !== group.name) {
      const existing = await prisma.traineeGroup.findUnique({
        where: {
          organizationId_name: {
            organizationId,
            name: input.name,
          },
        },
      });

      if (existing) {
        throw new Error('A group with this name already exists');
      }
    }

    return prisma.traineeGroup.update({
      where: { id: groupId },
      data: input,
    });
  }

  /**
   * Delete a group (soft delete by deactivating)
   */
  async deleteGroup(groupId: string, organizationId: string): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Soft delete - deactivate the group and all memberships
    await prisma.$transaction([
      prisma.groupMember.updateMany({
        where: { groupId },
        data: { isActive: false },
      }),
      prisma.trainerGroupAssignment.updateMany({
        where: { groupId },
        data: { isActive: false },
      }),
      prisma.traineeGroup.update({
        where: { id: groupId },
        data: { isActive: false },
      }),
    ]);
  }

  /**
   * Add trainees to a group
   */
  async addMembers(
    groupId: string,
    traineeIds: string[],
    organizationId: string
  ): Promise<{ added: number; skipped: number }> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Verify trainees belong to organization
    const trainees = await prisma.trainee.findMany({
      where: {
        id: { in: traineeIds },
        organizationId,
        role: 'trainee', // Only trainees can be added to groups
      },
      select: { id: true },
    });

    const validTraineeIds = trainees.map((t) => t.id);

    // Get existing members to avoid duplicates
    const existingMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        traineeId: { in: validTraineeIds },
      },
      select: { traineeId: true, isActive: true, id: true },
    });

    const existingMap = new Map(existingMembers.map((m) => [m.traineeId, m]));

    let added = 0;
    let skipped = 0;

    for (const traineeId of validTraineeIds) {
      const existing = existingMap.get(traineeId);

      if (existing) {
        if (!existing.isActive) {
          // Reactivate membership
          await prisma.groupMember.update({
            where: { id: existing.id },
            data: { isActive: true, joinedAt: new Date() },
          });
          added++;
        } else {
          skipped++;
        }
      } else {
        // Create new membership
        await prisma.groupMember.create({
          data: { groupId, traineeId },
        });
        added++;
      }
    }

    return { added, skipped };
  }

  /**
   * Remove a trainee from a group
   */
  async removeMember(
    groupId: string,
    traineeId: string,
    organizationId: string
  ): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    const member = await prisma.groupMember.findUnique({
      where: {
        groupId_traineeId: { groupId, traineeId },
      },
    });

    if (!member) {
      throw new Error('Trainee is not a member of this group');
    }

    // Soft delete
    await prisma.groupMember.update({
      where: { id: member.id },
      data: { isActive: false },
    });
  }

  /**
   * Assign a trainer to a group
   */
  async assignTrainer(
    groupId: string,
    trainerId: string,
    assignedById: string,
    organizationId: string
  ): Promise<TrainerGroupAssignment> {
    // Verify group belongs to organization
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Verify trainer belongs to organization and has trainer role
    const trainer = await prisma.trainee.findFirst({
      where: {
        id: trainerId,
        organizationId,
        role: 'trainer',
      },
    });

    if (!trainer) {
      throw new Error('Trainer not found or user is not a trainer');
    }

    // Check for existing assignment
    const existing = await prisma.trainerGroupAssignment.findUnique({
      where: {
        groupId_trainerId: { groupId, trainerId },
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new Error('Trainer is already assigned to this group');
      }

      // Reactivate assignment
      return prisma.trainerGroupAssignment.update({
        where: { id: existing.id },
        data: { isActive: true, assignedAt: new Date(), assignedById },
      });
    }

    return prisma.trainerGroupAssignment.create({
      data: {
        groupId,
        trainerId,
        assignedById,
      },
    });
  }

  /**
   * Unassign a trainer from a group
   */
  async unassignTrainer(
    groupId: string,
    trainerId: string,
    organizationId: string
  ): Promise<void> {
    const group = await prisma.traineeGroup.findFirst({
      where: { id: groupId, organizationId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    const assignment = await prisma.trainerGroupAssignment.findUnique({
      where: {
        groupId_trainerId: { groupId, trainerId },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new Error('Trainer is not assigned to this group');
    }

    // Soft delete
    await prisma.trainerGroupAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });
  }

  /**
   * Get groups assigned to a trainer
   */
  async getTrainerGroups(trainerId: string): Promise<GroupListItem[]> {
    const assignments = await prisma.trainerGroupAssignment.findMany({
      where: { trainerId, isActive: true },
      include: {
        group: {
          include: {
            members: {
              where: { isActive: true },
              select: { id: true },
            },
            trainerAssignments: {
              where: { isActive: true },
              include: {
                trainer: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return assignments.map((a) => ({
      id: a.group.id,
      name: a.group.name,
      description: a.group.description,
      isActive: a.group.isActive,
      createdAt: a.group.createdAt,
      memberCount: a.group.members.length,
      trainerCount: a.group.trainerAssignments.length,
      trainers: a.group.trainerAssignments.map((ta) => ta.trainer),
    }));
  }

  /**
   * Get available trainees (not in any active group) for adding to groups
   */
  async getAvailableTrainees(organizationId: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    groupCount: number;
  }[]> {
    const trainees = await prisma.trainee.findMany({
      where: {
        organizationId,
        role: 'trainee',
        status: 'active',
      },
      include: {
        groupMemberships: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    return trainees.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      groupCount: t.groupMemberships.length,
    }));
  }

  /**
   * Get available trainers for assigning to groups
   */
  async getAvailableTrainers(organizationId: string): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    groupCount: number;
  }[]> {
    const trainers = await prisma.trainee.findMany({
      where: {
        organizationId,
        role: 'trainer',
        status: 'active',
      },
      include: {
        trainerAssignments: {
          where: { isActive: true },
          select: { id: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    return trainers.map((t) => ({
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      groupCount: t.trainerAssignments.length,
    }));
  }
}

export const groupService = new GroupService();
