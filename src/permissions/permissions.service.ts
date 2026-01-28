import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto, PaginatedResponseDto } from '../common';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePermissionDto, tenantId: string, createdBy: string) {
    // Check if code exists
    const existing = await this.prisma.permission.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException('Permission code already exists');
    }

    const permission = await this.prisma.permission.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        module: dto.module,
        resource: dto.resource,
        action: dto.action,
        scope: dto.scope || 'TENANT',
        createdBy,
        isActive: true,
      },
    });

    return permission;
  }

  async findAll(tenantId: string, pagination: PaginationDto) {
    const where = {
      OR: [
        { tenantId },
        { tenantId: null }, // System permissions
      ],
      deletedAt: null,
      ...(pagination.search && {
        OR: [
          { code: { contains: pagination.search, mode: 'insensitive' as any } },
          { name: { contains: pagination.search, mode: 'insensitive' as any } },
          { module: { contains: pagination.search, mode: 'insensitive' as any } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.permission.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          module: true,
          resource: true,
          action: true,
          scope: true,
          isSystemPermission: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.permission.count({ where }),
    ]);

    return new PaginatedResponseDto(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  async update(id: string, dto: UpdatePermissionDto) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (permission.isSystemPermission) {
      throw new ConflictException('Cannot modify system permissions');
    }

    const updated = await this.prisma.permission.update({
      where: { id },
      data: dto,
    });

    return updated;
  }

  async remove(id: string) {
    const permission = await this.prisma.permission.findFirst({
      where: { id, deletedAt: null },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (permission.isSystemPermission) {
      throw new ConflictException('Cannot delete system permissions');
    }

    await this.prisma.permission.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return { message: 'Permission deleted successfully' };
  }

  async findByModule(module: string, tenantId: string) {
    return this.prisma.permission.findMany({
      where: {
        module,
        OR: [{ tenantId }, { tenantId: null }],
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }
}