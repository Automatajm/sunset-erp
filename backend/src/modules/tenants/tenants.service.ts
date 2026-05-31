// FILE: backend/src/modules/tenants/tenants.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  // ── List all tenants ───────────────────────────────────────────────────────

  async findAll() {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { userTenants: true } } },
      orderBy: { name: 'asc' },
    });
    return tenants.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      legalName: t.legalName,
      taxId: t.taxId,
      country: t.country,
      industry: t.industry,
      companySize: t.companySize,
      status: t.status,
      subscriptionPlan: t.subscriptionPlan,
      defaultCurrency: t.defaultCurrency,
      defaultLanguage: t.defaultLanguage,
      timezone: t.timezone,
      createdAt: t.createdAt,
      userCount: t._count.userTenants,
    }));
  }

  // ── Get single tenant with users ──────────────────────────────────────────

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { userTenants: true } },
        userTenants: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
                lastLoginAt: true,
                userRoles: {
                  where: { tenantId: id },
                  include: { role: { select: { id: true, code: true, name: true } } },
                },
              },
            },
          },
          orderBy: { user: { firstName: 'asc' } },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      legalName: tenant.legalName,
      taxId: tenant.taxId,
      country: tenant.country,
      industry: tenant.industry,
      companySize: tenant.companySize,
      status: tenant.status,
      subscriptionPlan: tenant.subscriptionPlan,
      subscriptionStatus: tenant.subscriptionStatus,
      defaultCurrency: tenant.defaultCurrency,
      defaultLanguage: tenant.defaultLanguage,
      timezone: tenant.timezone,
      fiscalYearStart: tenant.fiscalYearStart,
      createdAt: tenant.createdAt,
      userCount: tenant._count.userTenants,
      users: tenant.userTenants.map((ut) => ({
        id: ut.user.id,
        email: ut.user.email,
        firstName: ut.user.firstName,
        lastName: ut.user.lastName,
        fullName: `${ut.user.firstName} ${ut.user.lastName}`,
        status: ut.user.status,
        isActive: ut.isActive,
        isDefault: ut.isDefault,
        joinedAt: ut.joinedAt,
        lastLoginAt: ut.user.lastLoginAt,
        roles: ut.user.userRoles.map((r) => ({
          id: r.role.id,
          code: r.role.code,
          name: r.role.name,
        })),
      })),
    };
  }

  // ── Generate unique tenant code ──────────────────────────────────────────

  private async generateCode(name: string): Promise<string> {
    // Take first 4 uppercase letters from name, strip non-alpha
    const base = name
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4)
      .padEnd(4, 'X');
    // Find highest existing code with this prefix
    const last = await this.prisma.tenant.findFirst({
      where: { code: { startsWith: base + '-' } },
      orderBy: { code: 'desc' },
    });
    if (!last) return `${base}-0001`;
    const parts = last.code.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    const next = isNaN(num) ? 1 : num + 1;
    return `${base}-${next.toString().padStart(4, '0')}`;
  }

  // ── Create tenant ──────────────────────────────────────────────────────────

  async create(dto: {
    code?: string;
    name: string;
    country: string;
    legalName?: string;
    taxId?: string;
    industry?: string;
    companySize?: string;
    defaultCurrency?: string;
    defaultLanguage?: string;
    timezone?: string;
    subscriptionPlan?: string;
    status?: string;
  }) {
    // Auto-generate code if not provided
    const code = dto.code ? dto.code.toUpperCase().trim() : await this.generateCode(dto.name);

    const existing = await this.prisma.tenant.findFirst({
      where: { code },
    });
    if (existing) throw new ConflictException(`Tenant code "${code}" already exists`);

    const tenant = await this.prisma.tenant.create({
      data: {
        code,
        name: dto.name,
        country: dto.country,
        legalName: dto.legalName,
        taxId: dto.taxId,
        industry: dto.industry,
        companySize: dto.companySize,
        defaultCurrency: dto.defaultCurrency ?? 'USD',
        defaultLanguage: dto.defaultLanguage ?? 'en-US',
        timezone: dto.timezone ?? 'UTC',
        subscriptionPlan: dto.subscriptionPlan ?? 'free',
        subscriptionStatus: 'active',
        status: dto.status ?? 'active',
      },
    });

    return this.findOne(tenant.id);
  }

  // ── Update tenant ──────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: {
      name?: string;
      legalName?: string;
      taxId?: string;
      industry?: string;
      companySize?: string;
      country?: string;
      defaultCurrency?: string;
      defaultLanguage?: string;
      timezone?: string;
      subscriptionPlan?: string;
      status?: string;
    },
  ) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    await this.prisma.tenant.update({ where: { id }, data: { ...dto } });
    return this.findOne(id);
  }

  // ── Add user to tenant ────────────────────────────────────────────────────

  async addUser(tenantId: string, userId: string, isDefault = false) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.userTenant.findFirst({ where: { userId, tenantId } });

    if (existing) {
      await this.prisma.userTenant.update({
        where: { id: existing.id },
        data: { isActive: true, isDefault },
      });
    } else {
      await this.prisma.userTenant.create({
        data: { userId, tenantId, isActive: true, isDefault },
      });
    }

    return this.findOne(tenantId);
  }

  // ── Remove user from tenant ───────────────────────────────────────────────

  async removeUser(tenantId: string, userId: string) {
    const ut = await this.prisma.userTenant.findFirst({ where: { userId, tenantId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    await this.prisma.userTenant.update({
      where: { id: ut.id },
      data: { isActive: false },
    });
    await this.prisma.userRole.deleteMany({ where: { userId, tenantId } });

    return { message: 'User removed from tenant', userId, tenantId };
  }

  // ── Toggle default tenant for user ───────────────────────────────────────
  // unset=true  → remove default flag
  // unset=false → clear all defaults for this user, set this tenant as default

  async setDefaultTenant(tenantId: string, userId: string, unset = false) {
    const ut = await this.prisma.userTenant.findFirst({ where: { userId, tenantId } });
    if (!ut) throw new NotFoundException('User not found in this tenant');

    if (unset) {
      // Just remove default flag — user ends up with no default
      await this.prisma.userTenant.update({
        where: { id: ut.id },
        data: { isDefault: false },
      });
      return { message: 'Default tenant removed', userId, tenantId };
    }

    // Clear any existing default for this user, then set this one
    await this.prisma.userTenant.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
    await this.prisma.userTenant.update({
      where: { id: ut.id },
      data: { isDefault: true },
    });
    return { message: 'Default tenant updated', userId, tenantId };
  }
}
