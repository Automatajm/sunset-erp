// ============================================================================
// FILE: backend/src/modules/roles/roles.service.ts
// ============================================================================
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // ── List roles ────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        rolePermissions: {
          include: { permission: { select: { id: true, code: true, name: true, module: true } } },
        },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: 'asc' },
    });

    const mapped = roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      createdAt: r.createdAt,
      userCount: r._count.userRoles,
      permissions: r.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
      })),
    }));
    return { roles: mapped, count: mapped.length };
  }

  // ── Get all available permissions ─────────────────────────────────────────

  async findAllPermissions() {
    const perms = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });

    // Group by module
    const grouped: Record<string, typeof perms> = {};
    for (const p of perms) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    }

    return { permissions: perms, grouped, count: perms.length };
  }

  // ── Create role ───────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: {
      code: string;
      name: string;
      description?: string;
      permissionIds?: string[];
    },
  ) {
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, code: dto.code.toUpperCase(), deletedAt: null },
    });
    if (existing) throw new ConflictException(`Role code "${dto.code}" already exists`);

    let role;
    try {
      role = await this.prisma.role.create({
        data: {
          tenantId,
          code: dto.code.toUpperCase(),
          name: dto.name,
          description: dto.description,
          isSystem: false,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (e: any) {
      // Concurrent create can race the pre-check on @@unique([tenantId, code]).
      if (e?.code === 'P2002')
        throw new ConflictException(`Role code "${dto.code}" already exists`);
      throw e;
    }

    if (dto.permissionIds?.length) {
      await this.setPermissions(role.id, dto.permissionIds);
    }

    return this.findOne(tenantId, role.id);
  }

  // ── Get single role ───────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        rolePermissions: {
          include: { permission: { select: { id: true, code: true, name: true, module: true } } },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      userCount: role._count.userRoles,
      permissions: role.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
      })),
    };
  }

  // ── Update role ───────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: {
      name?: string;
      description?: string;
    },
  ) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot edit system roles');

    await this.prisma.role.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.findOne(tenantId, id);
  }

  // ── Set permissions (replace all) ────────────────────────────────────────

  async setPermissions(roleId: string, permissionIds: string[]) {
    // Validate permissions exist
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
    });
    if (perms.length !== permissionIds.length) {
      throw new BadRequestException('One or more permissions not found');
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });

    // This role's permission set just changed — every user holding it is now
    // stale. Invalidate each holder's cached permission context for their tenant.
    const holders = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true, tenantId: true },
    });
    await Promise.all(holders.map((h) => this.cache.clearPermissionCache(h.userId, h.tenantId)));
  }

  async updatePermissions(
    tenantId: string,
    userId: string,
    roleId: string,
    permissionIds: string[],
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId, deletedAt: null },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot edit system role permissions');

    await this.setPermissions(roleId, permissionIds);
    return this.findOne(tenantId, roleId);
  }

  // ── Delete role (soft) ────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot delete system roles');

    const usersWithRole = await this.prisma.userRole.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      throw new BadRequestException(
        `Cannot delete role assigned to ${usersWithRole} user(s). Remove role from users first.`,
      );
    }

    await this.prisma.role.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Role deleted', id };
  }
}
