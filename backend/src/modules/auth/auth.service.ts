import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
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

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get user's tenants
    const tenants = user.userTenants.map((ut) => ({
      id: ut.tenant.id,
      code: ut.tenant.code,
      name: ut.tenant.name,
      isDefault: ut.isDefault,
    }));

    if (tenants.length === 0) {
      throw new UnauthorizedException('User has no tenant access. Contact administrator.');
    }

    // If only one tenant, auto-select it
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

    // Multiple tenants - return list for selection
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
    // Verify user has access to this tenant
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

    // Generate new token with tenant
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
}
