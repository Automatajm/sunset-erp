// ============================================================================
// Unit tests for RolesService — spec-027-admin-cluster
// PrismaService + CacheService mocked. [GAP] = unchecked acceptance criterion.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/services/cache.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ROLE = '55555555-5555-5555-5555-555555555555';

type ModelMock = Record<string, jest.Mock>;

describe('RolesService', () => {
  let service: RolesService;
  let prisma: Record<string, any>;
  let cache: { clearPermissionCache: jest.Mock };

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = {
      role: model(),
      rolePermission: model(),
      userRole: model(),
      permission: model(),
    };
    cache = { clearPermissionCache: jest.fn().mockResolvedValue(undefined) };
    const mod = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();
    service = mod.get(RolesService);
  });

  // ── Reads + envelope ───────────────────────────────────────────────────────

  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.role.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { roles, count } envelope (fixes the empty page)', async () => {
    prisma.role.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A);
    expect(res).toHaveProperty('roles');
    expect(res).toHaveProperty('count');
  });

  it('findOne throws NotFoundException for another tenant', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, ROLE)).rejects.toThrow(NotFoundException);
  });

  // ── create ─────────────────────────────────────────────────────────────────

  it('create rejects a duplicate code via the friendly pre-check', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: ROLE }); // existing
    await expect(service.create(TENANT_A, USER, { code: 'OPS', name: 'Ops' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] create maps a P2002 race to 409 ConflictException', async () => {
    prisma.role.findFirst.mockResolvedValue(null); // pre-check passes
    prisma.role.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, { code: 'OPS', name: 'Ops' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('create uppercases the code and stamps audit', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    prisma.role.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: ROLE, ...data }),
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: ROLE } as any);
    await service.create(TENANT_A, USER, { code: 'ops', name: 'Ops' });
    expect(prisma.role.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, code: 'OPS', createdBy: USER }),
      }),
    );
  });

  // ── update / remove: system-role guards + scoped writes ───────────────────

  it('update blocks editing a system role', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: ROLE, isSystem: true });
    await expect(service.update(TENANT_A, USER, ROLE, { name: 'x' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] update writes via tenant-scoped updateMany', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: ROLE, isSystem: false });
    prisma.role.updateMany.mockResolvedValue({ count: 1 });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: ROLE } as any);
    await service.update(TENANT_A, USER, ROLE, { name: 'x' });
    expect(prisma.role.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ROLE, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('remove blocks system roles and roles in use', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: ROLE, isSystem: false });
    prisma.userRole.count.mockResolvedValue(3); // in use
    await expect(service.remove(TENANT_A, USER, ROLE)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] remove soft-deletes via tenant-scoped updateMany', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: ROLE, isSystem: false });
    prisma.userRole.count.mockResolvedValue(0);
    prisma.role.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, ROLE);
    expect(prisma.role.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ROLE, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  // ── setPermissions cache fan-out (spec-001 wiring — must not regress) ──────

  it('setPermissions validates perms and clears every holder cache', async () => {
    prisma.permission.findMany.mockResolvedValue([{ id: 'p1' }]);
    prisma.rolePermission.deleteMany.mockResolvedValue({});
    prisma.rolePermission.createMany.mockResolvedValue({});
    prisma.userRole.findMany.mockResolvedValue([
      { userId: 'u1', tenantId: TENANT_A },
      { userId: 'u2', tenantId: TENANT_A },
    ]);
    await service.setPermissions(ROLE, ['p1']);
    expect(cache.clearPermissionCache).toHaveBeenCalledTimes(2);
  });
});
