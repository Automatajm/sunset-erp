import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { PaginationDto, PaginatedResponseDto } from '../common';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoleDto, tenantId: string, createdBy: string) {
    // Check if code exists
    const existing = await this.prisma.role.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });

    if (existing) {
      throw new ConflictException('Role code already exists');
    }

    // Calculate level based on parent
    let level = 1;
    if (dto.parentRoleId) {
      const parent = await this.prisma.role.findUnique({
        where: { id: dto.parentRoleId },
      });
      if (parent) {
        level = parent.level + 1;
      }
    }

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        systemRole: dto.systemRole,
        parentRoleId: dto.parentRoleId,
        level,
        createdBy,
        isActive: true,
      },
      include: {
        parentRole: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return role;
  }

  async findAll(tenantId: string, pagination: PaginationDto) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(pagination.search && {
        OR: [
          { code: { contains: pagination.search, mode: 'insensitive' as any } },
          { name: { contains: pagination.search, mode: 'insensitive' as any } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          parentRole: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              userRoles: true,
              rolePermissions: true,
            },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        parentRole: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        childRoles: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        rolePermissions: {
          include: {
            permission: {
              select: {
                id: true,
                code: true,
                name: true,
                module: true,
                resource: true,
                action: true,
                scope: true,
              },
            },
          },
        },
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, tenantId: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystemRole) {
      throw new ConflictException('Cannot modify system roles');
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string, tenantId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: {
            userRoles: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystemRole) {
      throw new ConflictException('Cannot delete system roles');
    }

    if (role._count.userRoles > 0) {
      throw new ConflictException('Cannot delete role with assigned users');
    }

    await this.prisma.role.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return { message: 'Role deleted successfully' };
  }

  async assignPermissions(roleId: string, tenantId: string, dto: AssignPermissionsDto) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId, deletedAt: null },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Remove existing permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Assign new permissions
    await this.prisma.rolePermission.createMany({
      data: dto.permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
      })),
    });

    return { message: 'Permissions assigned successfully' };
  }
}