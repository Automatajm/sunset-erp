// ============================================================================
// Unit tests for WarehouseLocationsService — spec-014-warehouse-locations
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { WarehouseLocationsService } from './warehouse-locations.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
});

// A record fat enough to satisfy every entity's fetch-with-parent include.
const fatRecord = () => ({
  id: 'rec-id',
  code: '01',
  fullCode: 'STOR-01-01-01',
  zone: { code: 'STOR' },
  aisle: { fullCode: 'STOR-01' },
  rack: { fullCode: 'STOR-01-01' },
  level: { fullCode: 'STOR-01-01-01' },
});

describe('WarehouseLocationsService', () => {
  let service: WarehouseLocationsService;
  let prisma: {
    warehouse: ModelMock;
    warehouseZone: ModelMock;
    warehouseAisle: ModelMock;
    warehouseRack: ModelMock;
    warehouseLevel: ModelMock;
    warehouseBin: ModelMock;
    stock: ModelMock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      warehouse: model(),
      warehouseZone: model(),
      warehouseAisle: model(),
      warehouseRack: model(),
      warehouseLevel: model(),
      warehouseBin: model(),
      stock: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const mod = await Test.createTestingModule({
      providers: [WarehouseLocationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(WarehouseLocationsService);
  });

  // ── ZONES — create ─────────────────────────────────────────────────────────
  it('createZone validates the warehouse with { id, tenantId, deletedAt: null } and throws 404 when absent', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(
      service.createZone(TENANT_B, USER, { warehouseId: 'wh-of-A', code: 'X', name: 'X' } as never),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'wh-of-A', tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('createZone uppercases the code and stamps tenantId + audit columns', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' });
    prisma.warehouseZone.findFirst.mockResolvedValue(null);
    prisma.warehouseZone.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.createZone(TENANT_A, USER, {
      warehouseId: 'wh',
      code: 'stor',
      name: 'Storage',
    } as never);
    expect(result.code).toBe('STOR');
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.createdBy).toBe(USER);
    expect(result.zoneType).toBe('storage'); // default
  });

  it('createZone throws ConflictException when an active sibling has the code', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' });
    prisma.warehouseZone.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createZone(TENANT_A, USER, { warehouseId: 'wh', code: 'STOR', name: 'S' } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('[GAP] createZone duplicate-check query includes tenantId (spec §Tenant scoping)', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' });
    prisma.warehouseZone.findFirst.mockResolvedValue(null);
    prisma.warehouseZone.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.createZone(TENANT_A, USER, {
      warehouseId: 'wh',
      code: 'STOR',
      name: 'S',
    } as never);
    expect(prisma.warehouseZone.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('[GAP] createZone maps Prisma P2002 (soft-deleted sibling occupies the code) to ConflictException', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh' });
    prisma.warehouseZone.findFirst.mockResolvedValue(null); // dup-check is deletedAt-blind to the row
    prisma.warehouseZone.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.createZone(TENANT_A, USER, { warehouseId: 'wh', code: 'STOR', name: 'S' } as never),
    ).rejects.toThrow(ConflictException);
  });

  // ── ZONES — update ─────────────────────────────────────────────────────────
  it('updateZone throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue(null);
    await expect(service.updateZone(TENANT_B, USER, 'id-of-A', {} as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] updateZone uppercases the new code exactly as createZone does', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue(null);
    prisma.warehouseZone.findFirst.mockResolvedValueOnce({ id: 'z', code: 'STOR' });
    prisma.warehouseZone.update.mockImplementation(({ data }) => ({ id: 'z', ...data }));
    prisma.warehouseZone.updateMany.mockResolvedValue({ count: 1 });
    await service.updateZone(TENANT_A, USER, 'z', { code: 'recv' } as never);
    const writtenCodes = [
      ...prisma.warehouseZone.update.mock.calls.map(([a]) => a?.data?.code),
      ...prisma.warehouseZone.updateMany.mock.calls.map(([a]) => a?.data?.code),
    ].filter(Boolean);
    expect(writtenCodes).toContain('RECV');
  });

  // ── Update duplicate re-check — all five entities (spec §Duplicate handling) ─
  const PRISMA_KEYS = {
    updateZone: 'warehouseZone',
    updateAisle: 'warehouseAisle',
    updateRack: 'warehouseRack',
    updateLevel: 'warehouseLevel',
    updateBin: 'warehouseBin',
  } as const;

  Object.entries(PRISMA_KEYS).forEach(([method, prismaKey]) => {
    it(`[GAP] ${method} re-checks sibling-code uniqueness and throws ConflictException`, async () => {
      const m = (prisma as any)[prismaKey] as ModelMock;
      m.findFirst.mockResolvedValue({ id: 'sibling-with-code' }); // dup-check hit
      m.findFirst.mockResolvedValueOnce(fatRecord()); // fetch-before-update
      m.update.mockResolvedValue({});
      m.updateMany.mockResolvedValue({ count: 1 });
      await expect(
        (service as any)[method](TENANT_A, USER, 'rec-id', { code: 'DUP' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── ZONES — remove ─────────────────────────────────────────────────────────
  it('[GAP] removeZone throws BadRequestException while active aisles exist (spec §Deletes)', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue({ id: 'z' });
    prisma.warehouseAisle.count.mockResolvedValue(2);
    await expect(service.removeZone(TENANT_A, USER, 'z')).rejects.toThrow(BadRequestException);
  });

  it('removeZone soft-deletes (deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue({ id: 'z' });
    prisma.warehouseAisle.count.mockResolvedValue(0);
    prisma.warehouseZone.update.mockResolvedValue({});
    const result = await service.removeZone(TENANT_A, USER, 'z');
    expect(prisma.warehouseZone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: USER }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'z' }));
  });

  // ── AISLES ─────────────────────────────────────────────────────────────────
  it('createAisle composes fullCode ZONE-AISLE from the parent zone', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue({ id: 'z', code: 'STOR' });
    prisma.warehouseAisle.findFirst.mockResolvedValue(null);
    prisma.warehouseAisle.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.createAisle(TENANT_A, USER, {
      zoneId: 'z',
      code: '01',
    } as never);
    expect(result.fullCode).toBe('STOR-01');
  });

  it('createAisle throws NotFoundException when the zone belongs to another tenant', async () => {
    prisma.warehouseZone.findFirst.mockResolvedValue(null);
    await expect(
      service.createAisle(TENANT_B, USER, { zoneId: 'zone-of-A', code: '01' } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] removeAisle throws BadRequestException while active racks exist', async () => {
    prisma.warehouseAisle.findFirst.mockResolvedValue({ id: 'a' });
    prisma.warehouseRack.count.mockResolvedValue(1);
    await expect(service.removeAisle(TENANT_A, USER, 'a')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] updateAisle code change runs the descendant fullCode cascade in a transaction', async () => {
    prisma.warehouseAisle.findFirst.mockResolvedValue(null);
    prisma.warehouseAisle.findFirst.mockResolvedValueOnce({
      ...fatRecord(),
      fullCode: 'STOR-01',
    });
    prisma.warehouseAisle.update.mockResolvedValue({});
    prisma.warehouseAisle.updateMany.mockResolvedValue({ count: 1 });
    await service.updateAisle(TENANT_A, USER, 'a', { code: '02' } as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  // ── RACKS ──────────────────────────────────────────────────────────────────
  it('createRack composes fullCode from the parent aisle fullCode', async () => {
    prisma.warehouseAisle.findFirst.mockResolvedValue({ id: 'a', fullCode: 'STOR-01' });
    prisma.warehouseRack.findFirst.mockResolvedValue(null);
    prisma.warehouseRack.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.createRack(TENANT_A, USER, {
      aisleId: 'a',
      code: '01',
    } as never);
    expect(result.fullCode).toBe('STOR-01-01');
  });

  it('[GAP] removeRack throws BadRequestException while active levels exist', async () => {
    prisma.warehouseRack.findFirst.mockResolvedValue({ id: 'r' });
    prisma.warehouseLevel.count.mockResolvedValue(3);
    await expect(service.removeRack(TENANT_A, USER, 'r')).rejects.toThrow(BadRequestException);
  });

  // ── LEVELS ─────────────────────────────────────────────────────────────────
  it('createLevel composes fullCode from the parent rack fullCode', async () => {
    prisma.warehouseRack.findFirst.mockResolvedValue({ id: 'r', fullCode: 'STOR-01-01' });
    prisma.warehouseLevel.findFirst.mockResolvedValue(null);
    prisma.warehouseLevel.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.createLevel(TENANT_A, USER, {
      rackId: 'r',
      code: '01',
    } as never);
    expect(result.fullCode).toBe('STOR-01-01-01');
  });

  it('removeLevel throws BadRequestException while active bins exist (existing guard)', async () => {
    prisma.warehouseLevel.findFirst.mockResolvedValue({ id: 'l' });
    prisma.warehouseBin.count.mockResolvedValue(2);
    await expect(service.removeLevel(TENANT_A, USER, 'l')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] removeLevel bin-count guard includes tenantId (spec §Tenant scoping)', async () => {
    prisma.warehouseLevel.findFirst.mockResolvedValue({ id: 'l' });
    prisma.warehouseBin.count.mockResolvedValue(0);
    prisma.warehouseLevel.update.mockResolvedValue({});
    await service.removeLevel(TENANT_A, USER, 'l');
    expect(prisma.warehouseBin.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  // ── BINS ───────────────────────────────────────────────────────────────────
  it('createBin defaults binType standard + allowMixedItems true and composes the 5-segment fullCode', async () => {
    prisma.warehouseLevel.findFirst.mockResolvedValue({ id: 'l', fullCode: 'STOR-01-01-01' });
    prisma.warehouseBin.findFirst.mockResolvedValue(null);
    prisma.warehouseBin.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.createBin(TENANT_A, USER, {
      levelId: 'l',
      code: '01',
    } as never);
    expect(result.fullCode).toBe('STOR-01-01-01-01');
    expect(result.binType).toBe('standard');
    expect(result.allowMixedItems).toBe(true);
  });

  it('removeBin throws BadRequestException while stock on hand exists (existing guard)', async () => {
    prisma.warehouseBin.findFirst.mockResolvedValue({ id: 'b' });
    prisma.stock.count.mockResolvedValue(1);
    await expect(service.removeBin(TENANT_A, USER, 'b')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] removeBin stock-count guard includes tenantId (spec §Tenant scoping)', async () => {
    prisma.warehouseBin.findFirst.mockResolvedValue({ id: 'b' });
    prisma.stock.count.mockResolvedValue(0);
    prisma.warehouseBin.update.mockResolvedValue({});
    await service.removeBin(TENANT_A, USER, 'b');
    expect(prisma.stock.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  // ── Create duplicate-check tenant scoping — aisles/racks/levels/bins ───────
  const createDupCases: Array<{
    method: string;
    parentKey: string;
    childKey: string;
    parent: Record<string, unknown>;
    dto: Record<string, unknown>;
  }> = [
    {
      method: 'createAisle',
      parentKey: 'warehouseZone',
      childKey: 'warehouseAisle',
      parent: { id: 'z', code: 'STOR' },
      dto: { zoneId: 'z', code: '01' },
    },
    {
      method: 'createRack',
      parentKey: 'warehouseAisle',
      childKey: 'warehouseRack',
      parent: { id: 'a', fullCode: 'STOR-01' },
      dto: { aisleId: 'a', code: '01' },
    },
    {
      method: 'createLevel',
      parentKey: 'warehouseRack',
      childKey: 'warehouseLevel',
      parent: { id: 'r', fullCode: 'STOR-01-01' },
      dto: { rackId: 'r', code: '01' },
    },
    {
      method: 'createBin',
      parentKey: 'warehouseLevel',
      childKey: 'warehouseBin',
      parent: { id: 'l', fullCode: 'STOR-01-01-01' },
      dto: { levelId: 'l', code: '01' },
    },
  ];

  createDupCases.forEach(({ method, parentKey, childKey, parent, dto }) => {
    it(`[GAP] ${method} duplicate-check query includes tenantId`, async () => {
      ((prisma as any)[parentKey] as ModelMock).findFirst.mockResolvedValue(parent);
      const child = (prisma as any)[childKey] as ModelMock;
      child.findFirst.mockResolvedValue(null);
      child.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
      await (service as any)[method](TENANT_A, USER, dto);
      expect(child.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    });
  });

  // ── Lists — scoping + envelope (all five) ──────────────────────────────────
  const listCases: Array<{
    method: string;
    prismaKey: string;
    envelopeKey: string;
    parentArg: string;
    parentField: string;
  }> = [
    {
      method: 'findZones',
      prismaKey: 'warehouseZone',
      envelopeKey: 'zones',
      parentArg: 'wh',
      parentField: 'warehouseId',
    },
    {
      method: 'findAisles',
      prismaKey: 'warehouseAisle',
      envelopeKey: 'aisles',
      parentArg: 'z',
      parentField: 'zoneId',
    },
    {
      method: 'findRacks',
      prismaKey: 'warehouseRack',
      envelopeKey: 'racks',
      parentArg: 'a',
      parentField: 'aisleId',
    },
    {
      method: 'findLevels',
      prismaKey: 'warehouseLevel',
      envelopeKey: 'levels',
      parentArg: 'r',
      parentField: 'rackId',
    },
    {
      method: 'findBins',
      prismaKey: 'warehouseBin',
      envelopeKey: 'bins',
      parentArg: 'l',
      parentField: 'levelId',
    },
  ];

  listCases.forEach(({ method, prismaKey, envelopeKey, parentArg, parentField }) => {
    it(`${method} scopes the query to { ${parentField}, tenantId, deletedAt: null }, ordered by code`, async () => {
      const m = (prisma as any)[prismaKey] as ModelMock;
      m.findMany.mockResolvedValue([]);
      await (service as any)[method](TENANT_A, parentArg);
      expect(m.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            [parentField]: parentArg,
            tenantId: TENANT_A,
            deletedAt: null,
          }),
          orderBy: expect.objectContaining({ code: 'asc' }),
        }),
      );
    });

    it(`[GAP] ${method} returns the { ${envelopeKey}, count } envelope (spec §Response format)`, async () => {
      const m = (prisma as any)[prismaKey] as ModelMock;
      m.findMany.mockResolvedValue([{ id: 'x' }, { id: 'y' }]);
      const result: any = await (service as any)[method](TENANT_A, parentArg);
      expect(result).toEqual(
        expect.objectContaining({ [envelopeKey]: expect.any(Array), count: 2 }),
      );
    });
  });
});
