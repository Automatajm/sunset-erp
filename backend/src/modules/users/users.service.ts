// ============================================================================
// FILE: backend/src/modules/users/users.service.ts
// ============================================================================
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // ── List users in tenant ──────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            avatarUrl: true,
            lastLoginAt: true,
            createdAt: true,
            userRoles: {
              where: { tenantId },
              include: { role: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
      orderBy: { user: { firstName: 'asc' } },
    });

    const users = userTenants.map((ut) => ({
      id: ut.user.id,
      email: ut.user.email,
      firstName: ut.user.firstName,
      lastName: ut.user.lastName,
      fullName: `${ut.user.firstName} ${ut.user.lastName}`,
      status: ut.user.status,
      avatarUrl: ut.user.avatarUrl,
      lastLoginAt: ut.user.lastLoginAt,
      createdAt: ut.user.createdAt,
      isActive: ut.isActive,
      roles: ut.user.userRoles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
    }));
    return { users, count: users.length };
  }

  // ── Get single user ───────────────────────────────────────────────────────

  async findOne(tenantId: string, userId: string) {
    const ut = await this.prisma.userTenant.findFirst({
      where: { tenantId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            avatarUrl: true,
            phone: true,
            lastLoginAt: true,
            createdAt: true,
            userRoles: {
              where: { tenantId },
              include: { role: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    return {
      id: ut.user.id,
      email: ut.user.email,
      firstName: ut.user.firstName,
      lastName: ut.user.lastName,
      fullName: `${ut.user.firstName} ${ut.user.lastName}`,
      status: ut.user.status,
      avatarUrl: ut.user.avatarUrl,
      phone: ut.user.phone,
      lastLoginAt: ut.user.lastLoginAt,
      createdAt: ut.user.createdAt,
      isActive: ut.isActive,
      roles: ut.user.userRoles.map((r) => ({
        id: r.role.id,
        code: r.role.code,
        name: r.role.name,
      })),
    };
  }

  // ── Create user and add to tenant ─────────────────────────────────────────

  async create(
    tenantId: string,
    creatorId: string,
    dto: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
      roleIds?: string[];
    },
  ) {
    // Check email uniqueness
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // User exists — just add to tenant if not already there
      const alreadyInTenant = await this.prisma.userTenant.findFirst({
        where: { userId: existing.id, tenantId },
      });
      if (alreadyInTenant) throw new ConflictException('User already exists in this tenant');

      await this.prisma.userTenant.create({
        data: { userId: existing.id, tenantId, isActive: true },
      });

      if (dto.roleIds?.length) {
        await this.assignRoles(tenantId, existing.id, dto.roleIds);
      }

      return this.findOne(tenantId, existing.id);
    }

    // New user
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        status: 'active',
        userTenants: { create: { tenantId, isActive: true } },
      },
    });

    if (dto.roleIds?.length) {
      await this.assignRoles(tenantId, user.id, dto.roleIds);
    }

    return this.findOne(tenantId, user.id);
  }

  // ── Update user ───────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      status?: string;
    },
  ) {
    const ut = await this.prisma.userTenant.findFirst({ where: { tenantId, userId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    await this.prisma.user.update({
      where: { id: userId },
      data: { ...dto, updatedAt: new Date() },
    });

    return this.findOne(tenantId, userId);
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────

  async setActive(tenantId: string, userId: string, isActive: boolean, actingUserId?: string) {
    const ut = await this.prisma.userTenant.findFirst({ where: { tenantId, userId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    // spec-027 lock-out guards (deactivation only)
    if (!isActive) {
      if (actingUserId && userId === actingUserId) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      // Block deactivating the last active member holding an ADMIN:USERS role —
      // it would lock everyone out of user administration for this tenant.
      const activeAdmins = await this.prisma.userTenant.count({
        where: {
          tenantId,
          isActive: true,
          userId: { not: userId },
          user: {
            deletedAt: null,
            status: 'active',
            userRoles: {
              some: {
                tenantId,
                role: {
                  deletedAt: null,
                  rolePermissions: { some: { permission: { code: 'ADMIN:USERS' } } },
                },
              },
            },
          },
        },
      });
      if (activeAdmins === 0) {
        throw new BadRequestException(
          'Cannot deactivate the last active administrator of this tenant',
        );
      }
    }

    await this.prisma.userTenant.updateMany({
      where: { tenantId, userId },
      data: { isActive },
    });

    return this.findOne(tenantId, userId);
  }

  // ── Assign roles ──────────────────────────────────────────────────────────

  async assignRoles(tenantId: string, userId: string, roleIds: string[]) {
    const ut = await this.prisma.userTenant.findFirst({ where: { tenantId, userId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    // Validate roles belong to tenant
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, tenantId, deletedAt: null },
    });
    if (roles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles not found in this tenant');
    }

    // Remove existing roles for this tenant
    await this.prisma.userRole.deleteMany({ where: { userId, tenantId } });

    // Add new roles
    await this.prisma.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, tenantId })),
      skipDuplicates: true,
    });

    // This user's effective permissions just changed — drop the stale cache entry.
    await this.cache.clearPermissionCache(userId, tenantId);

    return this.findOne(tenantId, userId);
  }

  // ── Reset password ────────────────────────────────────────────────────────

  async resetPassword(tenantId: string, userId: string, newPassword: string) {
    const ut = await this.prisma.userTenant.findFirst({ where: { tenantId, userId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });

    return { message: 'Password reset successfully' };
  }
}
