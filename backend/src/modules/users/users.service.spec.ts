// ============================================================================
// Unit tests for UsersService — spec-027-admin-cluster
// PrismaService + CacheService mocked. Tests tagged [GAP] encode an unchecked
// `- [ ]` acceptance criterion and are expected to FAIL until implemented.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';

type ModelMock = Record<string, jest.Mock>;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: Record<string, any>;
  let cache: { clearPermissionCache: jest.Mock };

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = {
      user: model(),
      userTenant: model(),
      userRole: model(),
      role: model(),
    };
    cache = { clearPermissionCache: jest.fn().mockResolvedValue(undefined) };
    const mod = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = mod.get(UsersService);
  });

  // ── Reads + envelope ───────────────────────────────────────────────────────

  it('findAll scopes the membership query to tenantId', async () => {
    prisma.userTenant.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.userTenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('[GAP] findAll returns the { users, count } envelope (fixes the empty page)', async () => {
    prisma.userTenant.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A);
    expect(res).toHaveProperty('users');
    expect(res).toHaveProperty('count');
  });

  it('findOne throws NotFoundException when the user is not a member of the tenant', async () => {
    prisma.userTenant.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_A, OTHER)).rejects.toThrow(NotFoundException);
  });

  // ── assignRoles ────────────────────────────────────────────────────────────

  it('assignRoles validates roles belong to the tenant and clears the perm cache', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1' });
    prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);
    prisma.userRole.deleteMany.mockResolvedValue({});
    prisma.userRole.createMany.mockResolvedValue({});
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: USER } as any);
    await service.assignRoles(TENANT_A, USER, ['r1']);
    expect(prisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
    expect(cache.clearPermissionCache).toHaveBeenCalledWith(USER, TENANT_A);
  });

  it('assignRoles rejects roles not in the tenant', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1' });
    prisma.role.findMany.mockResolvedValue([]); // none match
    await expect(service.assignRoles(TENANT_A, USER, ['r1'])).rejects.toThrow(BadRequestException);
  });

  // ── setActive safety guards ────────────────────────────────────────────────

  it('setActive throws NotFoundException for a non-member', async () => {
    prisma.userTenant.findFirst.mockResolvedValue(null);
    await expect(service.setActive(TENANT_A, OTHER, false)).rejects.toThrow(NotFoundException);
  });

  it('[GAP] setActive(false) rejects self-deactivation', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1', userId: USER });
    // acting user === target user — signature gains the actingUserId argument
    await expect((service as any).setActive(TENANT_A, USER, false, USER)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] setActive(false) rejects deactivating the last admin of the tenant', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1', userId: OTHER });
    // Zero OTHER active admins remain → target is the last admin → block
    prisma.userTenant.count.mockResolvedValue(0);
    await expect((service as any).setActive(TENANT_A, OTHER, false, USER)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] setActive(false) is allowed when another active admin remains', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1', userId: OTHER });
    prisma.userTenant.count.mockResolvedValue(1); // another admin exists
    prisma.userTenant.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: OTHER } as any);
    await expect((service as any).setActive(TENANT_A, OTHER, false, USER)).resolves.toBeTruthy();
  });

  it('[GAP] setActive writes membership via tenant-scoped updateMany', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1', userId: OTHER });
    prisma.userTenant.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: OTHER } as any);
    await (service as any).setActive(TENANT_A, OTHER, true, USER);
    expect(prisma.userTenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });

  // ── create ─────────────────────────────────────────────────────────────────

  it('create adds an existing user to the tenant (409 if already a member)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: OTHER });
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1' }); // already in tenant
    await expect(
      service.create(TENANT_A, USER, {
        email: 'x@y.com',
        password: 'pw',
        firstName: 'A',
        lastName: 'B',
      }),
    ).rejects.toThrow(/already exists/);
  });
});
