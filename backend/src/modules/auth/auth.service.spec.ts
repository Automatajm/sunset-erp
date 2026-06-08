// ============================================================================
// Unit tests for AuthService refresh-token lifecycle — spec-034.
// PrismaService + JwtService + CacheService mocked. Focuses on the new
// issue/refresh/revoke logic (the rest of AuthService is covered by every e2e
// suite's login + auth-session.e2e).
// ============================================================================
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';

const USER = 'user-uuid';
const TENANT = 'tenant-uuid';

describe('AuthService — refresh tokens (spec-034)', () => {
  let service: AuthService;
  let prisma: { refreshToken: Record<string, jest.Mock> };
  let jwt: { sign: jest.Mock };

  beforeEach(async () => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: CacheService, useValue: {} },
      ],
    }).compile();
    service = mod.get(AuthService);
  });

  describe('issueRefreshToken', () => {
    it('persists a hashed token (never the raw value) and returns the raw + expiry', async () => {
      const res = await service.issueRefreshToken(USER, TENANT, {
        userAgent: 'jest',
        ip: '127.0.0.1',
      });
      expect(res.raw).toMatch(/^[0-9a-f]{96}$/); // 48 random bytes hex
      expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.userId).toBe(USER);
      expect(data.tenantId).toBe(TENANT);
      expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
      expect(data.tokenHash).not.toBe(res.raw); // stored hash != raw
    });
  });

  describe('refresh', () => {
    it('throws Unauthorized when no token is presented', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized for an unknown/revoked token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(service.refresh('deadbeef')).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized for an expired token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt1',
        userId: USER,
        tenantId: TENANT,
        expiresAt: new Date(Date.now() - 1000),
        user: { email: 'a@b.com', status: 'active' },
      });
      await expect(service.refresh('raw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws Unauthorized when the user is not active', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt1',
        userId: USER,
        tenantId: TENANT,
        expiresAt: new Date(Date.now() + 60000),
        user: { email: 'a@b.com', status: 'inactive' },
      });
      await expect(service.refresh('raw')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates (revokes old + issues new) and mints an access token on a valid refresh', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt1',
        userId: USER,
        tenantId: TENANT,
        expiresAt: new Date(Date.now() + 60000),
        user: { email: 'a@b.com', status: 'active' },
      });
      const res = await service.refresh('raw');
      // old token revoked
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      // new token issued
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(res.accessToken).toBe('signed.jwt.token');
      expect(res.refresh.raw).toMatch(/^[0-9a-f]{96}$/);
      // access token carries the tenant claim
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: USER, tenantId: TENANT }),
      );
    });
  });

  describe('revokeRefreshToken', () => {
    it('is a no-op when no token is given', async () => {
      await service.revokeRefreshToken(undefined);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('revokes the matching live token by hash', async () => {
      await service.revokeRefreshToken('raw');
      const arg = prisma.refreshToken.updateMany.mock.calls[0][0];
      expect(arg.where.revokedAt).toBeNull();
      expect(arg.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(arg.data.revokedAt).toBeInstanceOf(Date);
    });
  });
});
