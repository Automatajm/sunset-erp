// ============================================================================
// Unit tests for TenantsService — spec-027-admin-cluster
// PrismaService mocked. [GAP] = unchecked acceptance criterion.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT = '11111111-1111-1111-1111-111111111111';

type ModelMock = Record<string, jest.Mock>;

describe('TenantsService', () => {
  let service: TenantsService;
  let prisma: Record<string, any>;

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = { tenant: model(), user: model(), userTenant: model(), userRole: model() };
    const mod = await Test.createTestingModule({
      providers: [TenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(TenantsService);
  });

  // ── Reads + envelope ───────────────────────────────────────────────────────

  it('findAll filters soft-deleted tenants', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it('[GAP] findAll returns the { tenants, count } envelope', async () => {
    prisma.tenant.findMany.mockResolvedValue([]);
    const res: any = await service.findAll();
    expect(res).toHaveProperty('tenants');
    expect(res).toHaveProperty('count');
  });

  it('findOne throws NotFoundException for a missing tenant', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT)).rejects.toThrow(NotFoundException);
  });

  // ── create: code generation + dup handling ────────────────────────────────

  it('create rejects a duplicate code via the friendly pre-check', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: TENANT }); // existing code
    await expect(service.create({ name: 'Acme', country: 'DO', code: 'ACME' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] create maps a P2002 race on code to 409 ConflictException', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null); // pre-check passes
    prisma.tenant.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create({ name: 'Acme', country: 'DO', code: 'ACME' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] generateCode uses the NUMERIC max (spanning the prefix), not string sort', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null); // dup pre-check
    // String orderBy desc would pick ACME-9; numeric max must pick 10 → next 0011
    prisma.tenant.findMany.mockResolvedValue([{ code: 'ACME-9' }, { code: 'ACME-10' }]);
    prisma.tenant.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: TENANT, ...data }),
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: TENANT } as any);
    await service.create({ name: 'Acme Corp', country: 'DO' }); // no code → auto-generate
    const createdCode = prisma.tenant.create.mock.calls[0][0].data.code;
    expect(createdCode).toBe('ACME-0011');
  });

  // ── membership ops ─────────────────────────────────────────────────────────

  it('addUser throws when the tenant or the user is missing', async () => {
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(service.addUser(TENANT, 'u1')).rejects.toThrow(NotFoundException);
  });

  it('setDefaultTenant clears other defaults then sets this one', async () => {
    prisma.userTenant.findFirst.mockResolvedValue({ id: 'ut-1' });
    prisma.userTenant.updateMany.mockResolvedValue({});
    prisma.userTenant.update.mockResolvedValue({});
    const res = await service.setDefaultTenant(TENANT, 'u1', false);
    expect(prisma.userTenant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1', isDefault: true }),
      }),
    );
    expect(res.message).toMatch(/Default tenant updated/);
  });
});
