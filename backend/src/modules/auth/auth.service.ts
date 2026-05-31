import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private cache: CacheService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        passwordHash: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        status: 'active',
        locale: 'en-US',
        timezone: 'UTC',
      },
    });

    const { passwordHash, ...userWithoutPassword } = user;

    return {
      message: 'User registered successfully',
      user: userWithoutPassword,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        userTenants: {
          where: { isActive: true },
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tenants = user.userTenants.map((ut) => ({
      id: ut.tenant.id,
      code: ut.tenant.code,
      name: ut.tenant.name,
      isDefault: ut.isDefault,
    }));

    if (tenants.length === 0) {
      throw new UnauthorizedException('User has no tenant access. Contact administrator.');
    }

    if (tenants.length === 1) {
      const payload = {
        sub: user.id,
        email: user.email,
        tenantId: tenants[0].id,
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        tenant: tenants[0],
        requiresTenantSelection: false,
      };
    }

    const payload = {
      sub: user.id,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenants,
      requiresTenantSelection: true,
    };
  }

  async selectTenant(userId: string, selectTenantDto: SelectTenantDto) {
    const userTenant = await this.prisma.userTenant.findFirst({
      where: {
        userId,
        tenantId: selectTenantDto.tenantId,
        isActive: true,
      },
      include: {
        tenant: true,
        user: true,
      },
    });

    if (!userTenant) {
      throw new NotFoundException('You do not have access to this tenant');
    }

    const payload = {
      sub: userId,
      email: userTenant.user.email,
      tenantId: userTenant.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      user: {
        id: userTenant.user.id,
        email: userTenant.user.email,
        firstName: userTenant.user.firstName,
        lastName: userTenant.user.lastName,
      },
      tenant: {
        id: userTenant.tenant.id,
        code: userTenant.tenant.code,
        name: userTenant.tenant.name,
      },
    };
  }

  async getUserTenants(userId: string) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });

    return userTenants.map((ut) => ({
      id: ut.tenant.id,
      code: ut.tenant.code,
      name: ut.tenant.name,
      isDefault: ut.isDefault,
    }));
  }

  // Sprint 14F - List active users in tenant (for assignment UI)
  async getTenantUsers(tenantId: string) {
    const userTenants = await this.prisma.userTenant.findMany({
      where: { tenantId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            avatarUrl: true,
            userRoles: {
              where: { tenantId },
              include: { role: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
      orderBy: { user: { firstName: 'asc' } },
    });

    return userTenants
      .filter((ut) => ut.user.status === 'active')
      .map((ut) => ({
        id: ut.user.id,
        email: ut.user.email,
        firstName: ut.user.firstName,
        lastName: ut.user.lastName,
        fullName: `${ut.user.firstName} ${ut.user.lastName}`,
        avatarUrl: ut.user.avatarUrl,
        roles: ut.user.userRoles.map((r) => ({
          id: r.role.id,
          code: r.role.code,
          name: r.role.name,
        })),
      }));
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== 'active') {
      return null;
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ── RBAC context resolution (shared by JwtStrategy + PermissionsGuard) ──────
  // Single source of truth for a user's effective role + permissions in a tenant.
  // `role` is the earliest-assigned role's code; `permissions` is the union of
  // every assigned role's permission codes for that tenant.
  //
  // Backed by a Redis cache keyed `permissions:${userId}:${tenantId}` (TTL 15 min)
  // via CacheService, which is fail-open: any cache error falls back to the DB, so
  // auth never breaks. Invalidation lives in CacheService.clearPermissionCache,
  // called by the Roles/Users services when roles or role-permissions change.
  async resolveTenantContext(
    userId: string,
    tenantId: string | null,
  ): Promise<{ role: string; permissions: string[] }> {
    if (!tenantId) {
      return { role: 'user', permissions: [] };
    }

    // Cache lookup (returns null on miss or any Redis error).
    const cached = await this.cache.getPermissionContext(userId, tenantId);
    if (cached) {
      return cached;
    }

    // Cache miss — resolve from the DB and populate the cache (best-effort).
    const context = await this.queryTenantContext(userId, tenantId);
    await this.cache.setPermissionContext(userId, tenantId, context);
    return context;
  }

  private async queryTenantContext(
    userId: string,
    tenantId: string,
  ): Promise<{ role: string; permissions: string[] }> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId, tenantId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: { select: { code: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const permissions = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    return {
      role: userRoles[0]?.role.code ?? 'user',
      permissions: Array.from(permissions),
    };
  }
}
