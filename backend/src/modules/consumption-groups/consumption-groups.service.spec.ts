// ============================================================================
// Unit tests for ConsumptionGroupsService — spec-008-consumption-groups
// PrismaService (and UomService) are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConsumptionGroupsService } from './consumption-groups.service';
import { UomService } from '../uom/uom.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const UOM_ID = '44444444-4444-4444-4444-444444444444';

describe('ConsumptionGroupsService', () => {
  let service: ConsumptionGroupsService;
  let prisma: { consumptionGroup: Record<string, jest.Mock> };
  let uomService: { findOneUnit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      consumptionGroup: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };
    uomService = { findOneUnit: jest.fn().mockResolvedValue({ id: UOM_ID, code: 'g' }) };
    const mod = await Test.createTestingModule({
      providers: [
        ConsumptionGroupsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UomService, useValue: uomService },
      ],
    }).compile();
    service = mod.get(ConsumptionGroupsService);
  });

  // ── Tenant scoping — reads ───────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null, orders by code asc with includes', async () => {
    prisma.consumptionGroup.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.consumptionGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        orderBy: { code: 'asc' },
        include: expect.objectContaining({
          consumptionUom: true,
          _count: { select: { items: true } },
        }),
      }),
    );
  });

  it('findOne scopes by id + tenantId + deletedAt: null and filters items to active', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({ id: 'x', items: [] });
    await service.findOne(TENANT_A, 'x');
    const [arg] = prisma.consumptionGroup.findFirst.mock.calls[0];
    expect(arg.where).toEqual({ id: 'x', tenantId: TENANT_A, deletedAt: null });
    expect(arg.include.items.where).toEqual({ deletedAt: null });
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('findOne computes totalConsumptionQty = sum(onHand x purchaseToConsumptionFactor), 3 decimals', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({
      id: 'x',
      items: [
        {
          purchaseToConsumptionFactor: '1000',
          stock: [{ onHandQuantity: '2' }, { onHandQuantity: '3' }],
        },
        { purchaseToConsumptionFactor: '0.5', stock: [{ onHandQuantity: '4.001' }] },
      ],
    });
    const result: any = await service.findOne(TENANT_A, 'x');
    // (2+3)*1000 + 4.001*0.5 = 5000 + 2.0005 → 5002.001 (rounded to 3 decimals)
    expect(result.totalConsumptionQty).toBe(5002.001);
  });

  // ── Create + code generation ──────────────────────────────────────────────
  it('create auto-generates CG-YYYY-0001 when the tenant has no codes for the year', async () => {
    prisma.consumptionGroup.findMany.mockResolvedValue([]); // generateCode lookup
    prisma.consumptionGroup.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, { name: 'G', consumptionUomId: UOM_ID } as any);
    const year = new Date().getFullYear();
    expect(prisma.consumptionGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          code: `CG-${year}-0001`,
          isActive: true,
          createdBy: USER,
          updatedBy: USER,
        }),
      }),
    );
  });

  it('create increments from the NUMERIC max code (not lexicographic)', async () => {
    const year = new Date().getFullYear();
    prisma.consumptionGroup.findMany.mockResolvedValue([
      { code: `CG-${year}-99` },
      { code: `CG-${year}-0007` },
    ]);
    prisma.consumptionGroup.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, { name: 'G', consumptionUomId: UOM_ID } as any);
    expect(prisma.consumptionGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: `CG-${year}-0100` }),
      }),
    );
  });

  it('generateCode intentionally spans soft-deleted rows (no deletedAt in its where)', async () => {
    prisma.consumptionGroup.findMany.mockResolvedValue([]);
    prisma.consumptionGroup.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, { name: 'G', consumptionUomId: UOM_ID } as any);
    const [arg] = prisma.consumptionGroup.findMany.mock.calls[0];
    expect(arg.where).not.toHaveProperty('deletedAt');
    expect(arg.where.tenantId).toBe(TENANT_A);
  });

  it('[GAP] create validates consumptionUomId via UomService.findOneUnit and 404s on a bad id', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue(null);
    prisma.consumptionGroup.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    uomService.findOneUnit.mockRejectedValue(new NotFoundException('UOM unit not found'));
    await expect(
      service.create(TENANT_A, USER, { name: 'G', consumptionUomId: 'bad-uom' } as any),
    ).rejects.toThrow(NotFoundException);
    expect(uomService.findOneUnit).toHaveBeenCalledWith('bad-uom');
    expect(prisma.consumptionGroup.create).not.toHaveBeenCalled();
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the group is in another tenant', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (spec §Tenant scoping — currently where:{id})', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({ id: 'id', items: [] });
    prisma.consumptionGroup.update.mockResolvedValue({ id: 'id' });
    prisma.consumptionGroup.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    const scopedUpdateMany = prisma.consumptionGroup.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.consumptionGroup.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('[GAP] update validates a new consumptionUomId via UomService.findOneUnit', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({ id: 'id', items: [] });
    prisma.consumptionGroup.update.mockResolvedValue({ id: 'id' });
    prisma.consumptionGroup.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { consumptionUomId: UOM_ID } as any);
    expect(uomService.findOneUnit).toHaveBeenCalledWith(UOM_ID);
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove is blocked with BadRequestException while active items are assigned', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({
      id: 'id',
      items: [{ purchaseToConsumptionFactor: '1', stock: [] }],
      _count: { items: 1 },
    });
    prisma.consumptionGroup.count.mockResolvedValue(1);
    prisma.consumptionGroup.update.mockResolvedValue({ id: 'id' });
    prisma.consumptionGroup.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
  });

  it('remove performs a soft delete (deletedAt + deletedBy), never a hard delete', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({
      id: 'id',
      items: [],
      _count: { items: 0 },
    });
    prisma.consumptionGroup.count.mockResolvedValue(0);
    prisma.consumptionGroup.update.mockResolvedValue({ id: 'id' });
    prisma.consumptionGroup.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.consumptionGroup.updateMany.mock.calls[0] ??
      prisma.consumptionGroup.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself (spec §Tenant scoping)', async () => {
    prisma.consumptionGroup.findFirst.mockResolvedValue({
      id: 'id',
      items: [],
      _count: { items: 0 },
    });
    prisma.consumptionGroup.count.mockResolvedValue(0);
    prisma.consumptionGroup.update.mockResolvedValue({ id: 'id' });
    prisma.consumptionGroup.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.consumptionGroup.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.consumptionGroup.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { consumptionGroups, count } envelope (spec §Endpoints)', async () => {
    prisma.consumptionGroup.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ consumptionGroups: expect.any(Array), count: 2 }),
    );
  });
});
