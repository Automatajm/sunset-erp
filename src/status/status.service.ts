import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStatusGroupDto,
  UpdateStatusGroupDto,
  CreateStatusDto,
  UpdateStatusDto,
  QueryStatusGroupsDto,
} from './dto';

@Injectable()
export class StatusService {
  constructor(private prisma: PrismaService) {}

  // ============================================
  // STATUS GROUPS CRUD
  // ============================================

  async createGroup(tenantId: string, userId: string, dto: CreateStatusGroupDto) {
    const existing = await this.prisma.statusGroup.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Status group with code ${dto.code} already exists`);
    }

    return this.prisma.statusGroup.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        module: dto.module,
        entityType: dto.entityType,
        allowCustomStatuses: dto.allowCustomStatuses ?? false,
        requireWorkflow: dto.requireWorkflow ?? true,
        isActive: true,
        isSystemGroup: false,
        createdBy: userId,
      },
    });
  }

  async findAllGroups(tenantId: string, query: QueryStatusGroupsDto) {
    const { page = 1, limit = 50, module, entityType } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { tenantId },
        { tenantId: null },
      ],
      isActive: true,
      ...(module && { module }),
      ...(entityType && { entityType }),
    };

    const [data, total] = await Promise.all([
      this.prisma.statusGroup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
        include: {
          _count: {
            select: { statuses: true, transitions: true },
          },
        },
      }),
      this.prisma.statusGroup.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findGroupByCode(code: string) {
    const group = await this.prisma.statusGroup.findUnique({
      where: { code },
      include: {
        statuses: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
        transitions: {
          where: { isActive: true },
          include: {
            fromStatus: { select: { id: true, code: true, name: true } },
            toStatus: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Status group ${code} not found`);
    }

    return group;
  }

  async updateGroup(code: string, dto: UpdateStatusDto) {
    const group = await this.findGroupByCode(code);

    if (group.isSystemGroup && dto.code) {
      throw new BadRequestException('Cannot change code of system group');
    }

    if (dto.code && dto.code !== code) {
      const existing = await this.prisma.statusGroup.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new ConflictException(`Status group with code ${dto.code} already exists`);
      }
    }

    return this.prisma.statusGroup.update({
      where: { code },
      data: dto,
    });
  }

  async deleteGroup(code: string) {
    const group = await this.findGroupByCode(code);

    if (group.isSystemGroup) {
      throw new BadRequestException('Cannot delete system status group');
    }

    const statusCount = await this.prisma.status.count({
      where: { statusGroupId: group.id },
    });

    if (statusCount > 0) {
      throw new BadRequestException('Cannot delete status group with existing statuses');
    }

    return this.prisma.statusGroup.update({
      where: { code },
      data: { isActive: false },
    });
  }

  // ============================================
  // STATUSES CRUD
  // ============================================

  async createStatus(groupCode: string, tenantId: string, userId: string, dto: CreateStatusDto) {
    const group = await this.findGroupByCode(groupCode);

    const existing = await this.prisma.status.findUnique({
      where: { statusGroupId_code: { statusGroupId: group.id, code: dto.code } },
    });

    if (existing) {
      throw new ConflictException(`Status with code ${dto.code} already exists in this group`);
    }

    if (dto.isDefault) {
      await this.prisma.status.updateMany({
        where: { statusGroupId: group.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.status.create({
      data: {
        statusGroupId: group.id,
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        statusType: dto.statusType,
        displayOrder: dto.displayOrder ?? 0,
        color: dto.color,
        icon: dto.icon,
        isDefault: dto.isDefault ?? false,
        isEditable: dto.isEditable ?? true,
        isDeletable: dto.isDeletable ?? true,
        requiresApproval: dto.requiresApproval ?? false,
        requiredPermission: dto.requiredPermission,
        isActive: true,
        isSystemStatus: false,
        createdBy: userId,
      },
    });
  }

  async getStatusesByGroup(groupCode: string) {
    const group = await this.findGroupByCode(groupCode);
    return group.statuses;
  }

  async updateStatus(groupCode: string, statusCode: string, dto: UpdateStatusDto) {
    const group = await this.findGroupByCode(groupCode);

    const status = await this.prisma.status.findUnique({
      where: { statusGroupId_code: { statusGroupId: group.id, code: statusCode } },
    });

    if (!status) {
      throw new NotFoundException(`Status ${statusCode} not found`);
    }

    if (status.isSystemStatus && dto.code) {
      throw new BadRequestException('Cannot change code of system status');
    }

    if (dto.isDefault) {
      await this.prisma.status.updateMany({
        where: { statusGroupId: group.id, isDefault: true, id: { not: status.id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.status.update({
      where: { id: status.id },
      data: dto,
    });
  }

  async deleteStatus(groupCode: string, statusCode: string) {
    const group = await this.findGroupByCode(groupCode);

    const status = await this.prisma.status.findUnique({
      where: { statusGroupId_code: { statusGroupId: group.id, code: statusCode } },
    });

    if (!status) {
      throw new NotFoundException(`Status ${statusCode} not found`);
    }

    if (status.isSystemStatus) {
      throw new BadRequestException('Cannot delete system status');
    }

    return this.prisma.status.update({
      where: { id: status.id },
      data: { isActive: false },
    });
  }
}
