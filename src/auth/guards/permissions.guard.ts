import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user's permissions from database
    const userPermissions = await this.getUserPermissions(user.userId);

    // Check if user has required permissions
    const hasPermission = this.checkPermissions(
      userPermissions,
      requiredPermissions,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: `,
      );
    }

    return true;
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    // Get permissions from user's roles
    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        userPermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!userWithRoles) {
      return [];
    }

    // Collect permissions from roles
    const rolePermissions = userWithRoles.userRoles.flatMap((ur) =>
      ur.role.rolePermissions.map((rp) => rp.permission.code),
    );

    // Collect direct user permissions
    const directPermissions = userWithRoles.userPermissions.map(
      (up) => up.permission.code,
    );

    // Combine and deduplicate
    return [...new Set([...rolePermissions, ...directPermissions])];
  }

  private checkPermissions(
    userPermissions: string[],
    requiredPermissions: string[],
  ): boolean {
    // Check if user has wildcard permission
    if (userPermissions.includes('*:*:*:*') || userPermissions.includes('ADM:*:*:*')) {
      return true;
    }

    // Check each required permission
    return requiredPermissions.every((required) => {
      // Direct match
      if (userPermissions.includes(required)) {
        return true;
      }

      // Check wildcard patterns
      return this.matchesWildcard(userPermissions, required);
    });
  }

  private matchesWildcard(
    userPermissions: string[],
    requiredPermission: string,
  ): boolean {
    const [reqModule, reqResource, reqAction, reqScope] = requiredPermission.split(':');

    return userPermissions.some((userPerm) => {
      const [userModule, userResource, userAction, userScope] = userPerm.split(':');

      // Check each part with wildcard support
      const moduleMatch = userModule === '*' || userModule === reqModule;
      const resourceMatch = userResource === '*' || userResource === reqResource;
      const actionMatch = userAction === '*' || userAction === reqAction;
      const scopeMatch = userScope === '*' || userScope === reqScope;

      return moduleMatch && resourceMatch && actionMatch && scopeMatch;
    });
  }
}