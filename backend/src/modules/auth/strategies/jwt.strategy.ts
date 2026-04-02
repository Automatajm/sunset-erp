// FILE: backend/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateUser(payload.sub);

    if (!user) throw new UnauthorizedException();

    const tenantId = payload.tenantId || null;

    // Resolve primary role for this tenant
    let role        = 'user';
    let permissions: string[] = [];

    if (tenantId) {
      const userRole = await this.prisma.userRole.findFirst({
        where: { userId: user.id, tenantId },
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

      if (userRole) {
        role        = userRole.role.code;
        permissions = userRole.role.rolePermissions.map(rp => rp.permission.code);
      }
    }

    return {
      id:          user.id,
      email:       user.email,
      firstName:   user.firstName,
      lastName:    user.lastName,
      tenantId,
      role,
      permissions,
    };
  }
}