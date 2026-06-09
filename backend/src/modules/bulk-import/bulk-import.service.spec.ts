// ============================================================================
// Unit tests for BulkImportService — critical data-integrity fixes
// PrismaService is mocked; these assert behavior, not the DB.
// $transaction is mocked to invoke its callback with the prisma mock so inner
// tx.* calls land on the same model mocks.
// ============================================================================
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BulkImportService } from './bulk-import.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn().mockResolvedValue(null),
  findUnique: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 'new-id' }),
  update: jest.fn().mockResolvedValue({ id: 'upd-id' }),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({}),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
});

const p2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('BulkImportService', () => {
  let service: BulkImportService;
  let prisma: Record<string, ModelMock> & { $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      item: model(),
      customer: model(),
      supplier: model(),
      warehouse: model(),
      workCenter: model(),
      account: model(),
      salesOrder: model(),
      salesOrderLine: model(),
      purchaseOrder: model(),
      purchaseOrderLine: model(),
      budget: model(),
      budgetLine: model(),
      fiscalPeriod: model(),
      bom: model(),
      bomComponent: model(),
      bomRouting: model(),
      warehouseZone: model(),
      warehouseAisle: model(),
      warehouseRack: model(),
      warehouseLevel: model(),
      warehouseBin: model(),
      user: model(),
      userTenant: model(),
      userRole: model(),
      role: model(),
      permission: model(),
      rolePermission: model(),
      // $transaction invokes its callback with the same prisma mock so tx.* lands
      // on these model mocks.
      $transaction: jest.fn((cb: any) => cb(prisma)),
    } as never;

    const mod = await Test.createTestingModule({
      providers: [BulkImportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(BulkImportService);
  });

  // ── (1) dispatcher validation ──────────────────────────────────────────────
  it('rejects an unknown entity with BadRequestException', async () => {
    await expect(
      service.importEntity(TENANT_A, USER, 'widgets' as never, { records: [{ code: 'x' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an empty record set with BadRequestException', async () => {
    await expect(service.importEntity(TENANT_A, USER, 'items', { records: [] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects more than 2000 rows with BadRequestException', async () => {
    const records = Array.from({ length: 2001 }, (_, i) => ({ code: `C${i}`, name: 'x' }));
    await expect(service.importEntity(TENANT_A, USER, 'items', { records })).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── (2) dryRun does not write ──────────────────────────────────────────────
  it('dryRun does NOT call any create or update', async () => {
    const records = [{ code: 'ITM-1', name: 'A', itemType: 'raw', baseUom: 'PCS' }];
    const result = await service.importEntity(TENANT_A, USER, 'items', {
      records,
      dryRun: true,
    });
    expect(prisma.item.create).not.toHaveBeenCalled();
    expect(prisma.item.update).not.toHaveBeenCalled();
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
    expect(result.inserted).toBe(0);
  });

  // ── (3) P2002 on create → row error, batch continues ───────────────────────
  it('items: a P2002 on create becomes a row error and the remaining rows still process', async () => {
    prisma.item.findFirst.mockResolvedValue(null); // none exist → all inserts
    prisma.item.create
      .mockRejectedValueOnce(p2002()) // row 1 dupes
      .mockResolvedValue({ id: 'ok' }); // row 2 succeeds

    const records = [
      { code: 'DUP', name: 'A', itemType: 'raw', baseUom: 'PCS' },
      { code: 'OK', name: 'B', itemType: 'raw', baseUom: 'PCS' },
    ];

    const result = await service.importEntity(TENANT_A, USER, 'items', { records });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ row: 1, field: 'code' });
    expect(result.errors[0].message).toMatch(/Duplicate/);
    expect(result.inserted).toBe(1); // row 2 still inserted
    expect(prisma.item.create).toHaveBeenCalledTimes(2); // not aborted after row 1
  });

  it('items: a non-P2002 write error is also caught as a row error (no throw)', async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    prisma.item.create.mockRejectedValue(new Error('db exploded'));
    const records = [{ code: 'X', name: 'A', itemType: 'raw', baseUom: 'PCS' }];
    const result = await service.importEntity(TENANT_A, USER, 'items', { records });
    expect(result.errors).toHaveLength(1);
    expect(result.inserted).toBe(0);
  });

  // ── (4) BOM upsert wraps delete + recreate in $transaction ─────────────────
  it('BOM upsert wraps the component delete + recreate in $transaction', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: 'item-1', baseUom: 'PCS' }); // parent + comp
    prisma.bom.findFirst.mockResolvedValue({ id: 'bom-1' }); // exists → upsert path

    const records = [
      { bomNumber: 'BOM-1', parentItemCode: 'P1', componentCode: 'C1', quantityPer: 2 },
    ];
    await service.importEntity(TENANT_A, USER, 'boms', { records, upsert: true });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.bomComponent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, bomId: 'bom-1' }),
      }),
    );
    expect(prisma.bomComponent.create).toHaveBeenCalled();
  });

  it('BOM upsert deleteMany is tenant-scoped (no cross-tenant wipe)', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: 'item-1', baseUom: 'PCS' });
    prisma.bom.findFirst.mockResolvedValue({ id: 'bom-1' });
    const records = [
      { bomNumber: 'BOM-1', parentItemCode: 'P1', componentCode: 'C1', quantityPer: 2 },
    ];
    await service.importEntity(TENANT_A, USER, 'boms', { records, upsert: true });
    const call = prisma.bomComponent.deleteMany.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT_A);
  });

  // ── (5) tenant-owned update goes through updateMany with tenantId ──────────
  it('items upsert routes the write through updateMany scoped by tenantId', async () => {
    prisma.item.findFirst.mockResolvedValue({
      id: 'existing-1',
      description: null,
      isStockable: true,
      isPurchasable: true,
      isSaleable: true,
      isManufacturable: false,
      valuationMethod: 'average',
      standardCost: null,
      leadTimeDays: 0,
      safetyStock: null,
      reorderPoint: null,
      reorderQuantity: null,
    });

    const records = [{ code: 'ITM-1', name: 'Updated', itemType: 'raw', baseUom: 'PCS' }];
    const result = await service.importEntity(TENANT_A, USER, 'items', {
      records,
      upsert: true,
    });

    expect(prisma.item.update).not.toHaveBeenCalled(); // never a bare update
    expect(prisma.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'existing-1', tenantId: TENANT_A, deletedAt: null }),
      }),
    );
    expect(result.updated).toBe(1);
  });
});
