// ============================================================================
// Unit tests for WarehousesService — spec-004-warehouses
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const WH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const warehouseRow = (over: Record<string, any> = {}) => ({
  id: WH_ID,
  tenantId: TENANT_A,
  code: 'WH-REG-001',
  name: 'Main',
  warehouseType: 'regular',
  _count: { stock: 0, zones: 0 },
  ...over,
});

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: {
    warehouse: Record<string, jest.Mock>;
    warehouseZone: Record<string, jest.Mock>;
    warehouseAisle: Record<string, jest.Mock>;
    warehouseRack: Record<string, jest.Mock>;
    warehouseLevel: Record<string, jest.Mock>;
    warehouseBin: Record<string, jest.Mock>;
    stock: Record<string, jest.Mock>;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      warehouse: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      warehouseZone: { findMany: jest.fn(), count: jest.fn() },
      warehouseAisle: { count: jest.fn() },
      warehouseRack: { count: jest.fn() },
      warehouseLevel: { count: jest.fn(), aggregate: jest.fn() },
      warehouseBin: { count: jest.fn(), aggregate: jest.fn() },
      stock: { aggregate: jest.fn() },
      $queryRaw: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [WarehousesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(WarehousesService);
  });

  // ── Tenant scoping (reads) ──────────────────────────────────────────────────
  it('findAll scopes the warehouse query to tenantId + deletedAt: null', async () => {
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findAll runs the two capacity aggregates ($queryRaw)', async () => {
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('findAll enriches each warehouse with counts and occupancy', async () => {
    prisma.warehouse.findMany.mockResolvedValue([warehouseRow({ _count: { stock: 5, zones: 2 } })]);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { warehouse_id: WH_ID, cap_kg: 100, cap_ltr: null, cap_pallets: 50, bin_count: 0 },
      ])
      .mockResolvedValueOnce([]);
    const res = await service.findAll(TENANT_A);
    expect(res[0]).toEqual(
      expect.objectContaining({
        stockCount: 5,
        zoneCount: 2,
        capacityPallets: 50,
        occupancyPct: 10, // 5 / 50 * 100
      }),
    );
  });

  it('findOne scopes to id + tenantId + deletedAt: null', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    await service.findOne(TENANT_A, WH_ID);
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: WH_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findOne throws NotFoundException for an id in another tenant', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, WH_ID)).rejects.toThrow(NotFoundException);
  });

  // ── Create ──────────────────────────────────────────────────────────────────
  it('create auto-generates a WH-{TYPE}-{NNN} code when omitted', async () => {
    prisma.warehouse.findMany.mockResolvedValue([]); // generateCode: no prior codes
    prisma.warehouse.findFirst.mockResolvedValue(null); // duplicate check
    prisma.warehouse.create.mockImplementation(({ data }) => data);
    const res = await service.create(TENANT_A, USER, {
      name: 'New',
      warehouseType: 'regular',
    } as any);
    expect(res.code).toBe('WH-REG-001');
  });

  it('create increments the sequence from the NUMERIC max code (not lexicographic)', async () => {
    // 'WH-CON-99' sorts above 'WH-CON-104' lexicographically — the numeric max must win.
    prisma.warehouse.findMany.mockResolvedValue([
      { code: 'WH-CON-99' },
      { code: 'WH-CON-104' },
      { code: 'WH-CON-004' },
    ]);
    prisma.warehouse.findFirst.mockResolvedValue(null); // dup check
    prisma.warehouse.create.mockImplementation(({ data }) => data);
    const res = await service.create(TENANT_A, USER, {
      name: 'New',
      warehouseType: 'consignment',
    } as any);
    expect(res.code).toBe('WH-CON-105');
  });

  it('create generateCode read is tenant-scoped and SPANS soft-deleted rows', async () => {
    // @@unique([tenantId, code]) spans soft-deleted rows — codegen must consider them
    // (suppliers convention); filtering deletedAt regenerated occupied codes (P2002).
    prisma.warehouse.findMany.mockResolvedValue([]);
    prisma.warehouse.findFirst.mockResolvedValue(null);
    prisma.warehouse.create.mockImplementation(({ data }) => data);
    await service.create(TENANT_A, USER, { name: 'New' } as any);
    const [arg] = prisma.warehouse.findMany.mock.calls[0];
    expect(arg.where.tenantId).toBe(TENANT_A);
    expect(arg.where).not.toHaveProperty('deletedAt');
  });

  // ── Update ──────────────────────────────────────────────────────────────────
  it('[GAP] update write is tenant-scoped via updateMany({ id, tenantId, deletedAt })', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    prisma.warehouse.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, WH_ID, { name: 'Renamed' } as any);
    expect(prisma.warehouse.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: WH_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('update throws NotFoundException for an id in another tenant', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, WH_ID, { name: 'x' } as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── Remove ──────────────────────────────────────────────────────────────────
  it('remove soft-deletes (sets deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    prisma.warehouse.updateMany.mockResolvedValue({ count: 1 });
    prisma.warehouse.update.mockResolvedValue(warehouseRow());
    const res = await service.remove(TENANT_A, USER, WH_ID);
    expect(res).toEqual({ message: 'Warehouse deleted successfully', id: WH_ID });
  });

  it('[GAP] remove write is tenant-scoped via updateMany({ id, tenantId, deletedAt })', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    prisma.warehouse.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, WH_ID);
    expect(prisma.warehouse.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: WH_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ deletedBy: USER }),
      }),
    );
  });

  it('remove throws NotFoundException for an id in another tenant', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, WH_ID)).rejects.toThrow(NotFoundException);
  });

  // ── Location tree ─────────────────────────────────────────────────────────
  it('getLocationTree validates the warehouse then scopes zones to tenantId + deletedAt', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    prisma.warehouseZone.findMany.mockResolvedValue([]);
    await service.getLocationTree(TENANT_A, WH_ID);
    expect(prisma.warehouseZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ warehouseId: WH_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('getLocationTree throws NotFoundException when the warehouse is missing', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.getLocationTree(TENANT_B, WH_ID)).rejects.toThrow(NotFoundException);
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const mockStats = () => {
    prisma.warehouse.findFirst.mockResolvedValue(warehouseRow());
    prisma.stock.aggregate.mockResolvedValue({ _sum: { onHandQuantity: 10 }, _count: { id: 3 } });
    prisma.warehouseZone.count.mockResolvedValue(2);
    prisma.warehouseAisle.count.mockResolvedValue(4);
    prisma.warehouseRack.count.mockResolvedValue(8);
    prisma.warehouseLevel.count.mockResolvedValue(16);
    prisma.warehouseBin.count.mockResolvedValue(0);
    prisma.warehouseLevel.aggregate.mockResolvedValue({
      _sum: { maxWeightKg: 100, maxVolumeLtr: null, maxPallets: 30 },
    });
    prisma.warehouseBin.aggregate.mockResolvedValue({
      _sum: { maxWeightKg: null, maxVolumeLtr: null, maxPallets: null },
    });
  };

  it('getStats returns the documented shape (locations + capacity + stockLines)', async () => {
    mockStats();
    const res = await service.getStats(TENANT_A, WH_ID);
    expect(res).toEqual(
      expect.objectContaining({
        stockLines: 3,
        locations: expect.objectContaining({ zones: 2, bins: 0 }),
        capacity: expect.objectContaining({ maxPallets: 30 }),
      }),
    );
  });

  it('[GAP] getStats zone count is scoped with tenantId', async () => {
    mockStats();
    await service.getStats(TENANT_A, WH_ID);
    expect(prisma.warehouseZone.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });

  it('getStats throws NotFoundException when the warehouse is missing', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.getStats(TENANT_B, WH_ID)).rejects.toThrow(NotFoundException);
  });
});
