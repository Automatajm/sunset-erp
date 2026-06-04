// ============================================================================
// Unit tests for WorkCentersService — spec-010-work-centers
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { WorkCentersService } from './work-centers.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

// Decimal stand-in: format helper calls .toNumber() on truthy values.
const dec = (n: number) => ({ toNumber: () => n });
// A row the format helper can always digest.
const row = (extra: Record<string, unknown> = {}) => ({
  id: 'id',
  capacityPerHour: null,
  efficiencyPercent: null,
  costPerHour: null,
  ...extra,
});

describe('WorkCentersService', () => {
  let service: WorkCentersService;
  let prisma: { workCenter: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      workCenter: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [WorkCentersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(WorkCentersService);
  });

  // ── Tenant scoping — reads ───────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null and orders by code asc', async () => {
    prisma.workCenter.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.workCenter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        orderBy: { code: 'asc' },
      }),
    );
  });

  it('findAll formats Decimal columns to numbers (nullable → null, efficiency default 100)', async () => {
    prisma.workCenter.findMany.mockResolvedValue([
      row({ capacityPerHour: dec(120), efficiencyPercent: dec(95), costPerHour: null }),
    ]);
    const result: any = await service.findAll(TENANT_A);
    const rows = Array.isArray(result) ? result : result.workCenters;
    expect(rows[0].capacityPerHour).toBe(120);
    expect(rows[0].efficiencyPercent).toBe(95);
    expect(rows[0].costPerHour).toBeNull();
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('findOne scopes by id + tenantId + deletedAt: null', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(row());
    await service.findOne(TENANT_A, 'id');
    expect(prisma.workCenter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'id', tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Create + auto-code WC-YYYY-NNNN (spec-012) ───────────────────────────
  it('create auto-generates WC-YYYY-NNNN from the NUMERIC max, spanning soft-deleted rows', async () => {
    const year = new Date().getFullYear();
    prisma.workCenter.findMany.mockResolvedValue([
      { code: `WC-${year}-99` },
      { code: `WC-${year}-104` },
      { code: 'WC-PREP-01' }, // legacy mnemonic — prefix differs, ignored
    ]);
    prisma.workCenter.create.mockImplementation(({ data }) => row({ ...data }));
    const result: any = await service.create(TENANT_A, USER, { name: 'X' } as any);
    expect(result.code).toBe(`WC-${year}-0105`);
    const [arg] = prisma.workCenter.findMany.mock.calls[0];
    expect(arg.where.tenantId).toBe(TENANT_A);
    expect(arg.where).not.toHaveProperty('deletedAt');
  });

  it('create writes tenantId from the JWT, audit columns, and defaults (type machine, active)', async () => {
    prisma.workCenter.findMany.mockResolvedValue([]);
    prisma.workCenter.create.mockResolvedValue(row({ code: 'WC-2026-0001' }));
    await service.create(TENANT_A, USER, { name: 'X' } as any);
    expect(prisma.workCenter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          workCenterType: 'machine',
          isActive: true,
          createdBy: USER,
          updatedBy: USER,
        }),
      }),
    );
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the work center is in another tenant', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (currently where:{id})', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(row());
    prisma.workCenter.update.mockResolvedValue(row());
    prisma.workCenter.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    const scopedUpdateMany = prisma.workCenter.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.workCenter.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove is blocked while active BOM routings reference the work center', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(row({ _count: { routings: 2 } }));
    prisma.workCenter.update.mockResolvedValue(row());
    prisma.workCenter.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
  });

  it('remove performs a soft delete (deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(row({ _count: { routings: 0 } }));
    prisma.workCenter.update.mockResolvedValue(row());
    prisma.workCenter.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.workCenter.updateMany.mock.calls[0] ?? prisma.workCenter.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.workCenter.findFirst.mockResolvedValue(row({ _count: { routings: 0 } }));
    prisma.workCenter.update.mockResolvedValue(row());
    prisma.workCenter.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.workCenter.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.workCenter.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { workCenters, count } envelope (spec §Endpoints)', async () => {
    prisma.workCenter.findMany.mockResolvedValue([row(), row({ id: 'b' })]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ workCenters: expect.any(Array), count: 2 }));
  });
});
