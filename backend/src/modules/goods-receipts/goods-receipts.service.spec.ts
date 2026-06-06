// ============================================================================
// Unit tests for GoodsReceiptsService — spec-023-goods-receipts
// PrismaService and UomService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const WH = '44444444-4444-4444-4444-444444444444';
const PO_A = '55555555-5555-5555-5555-555555555555';
const POL = '66666666-6666-6666-6666-666666666666';
const ITEM = '77777777-7777-7777-7777-777777777777';
const SUP = '88888888-8888-8888-8888-888888888888';
const GRN_ID = '99999999-9999-9999-9999-999999999999';

const YEAR = new Date().getFullYear();

const ALLQ = {
  purchaseQty: 10,
  purchaseUom: 'KG',
  storageQty: 10,
  storageUom: 'KG',
  consumptionQty: 10000,
  consumptionUom: 'G',
};

type ModelMock = Record<string, jest.Mock>;

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;
  let prisma: Record<string, any>;
  let uom: { calcAllQties: jest.Mock; calcNewWAC: jest.Mock };

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = {
      goodsReceipt: model(),
      goodsReceiptLine: model(),
      purchaseOrder: model(),
      purchaseOrderLine: model(),
      stockMovement: model(),
      stock: model(),
      warehouse: model(),
      item: model(),
      supplierItem: model(),
      $queryRaw: jest.fn(),
    };
    // The service runs its posting inside $transaction(cb) — hand the same mock
    // object back as `tx` so tx.* and this.prisma.* share the jest.Mocks.
    prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => cb(prisma));

    uom = { calcAllQties: jest.fn(), calcNewWAC: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UomService, useValue: uom },
      ],
    }).compile();
    service = mod.get(GoodsReceiptsService);
  });

  // Wire every mock a fully-valid PO-linked create needs; individual tests
  // override the pieces they exercise.
  const setupCreateMocks = () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: PO_A,
      status: 'confirmed',
      supplierId: SUP,
    });
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.purchaseOrderLine.findFirst.mockResolvedValue({
      id: POL,
      purchaseOrderId: PO_A,
      orderedQuantity: 100,
      receivedQuantity: 0,
    });
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    prisma.goodsReceipt.findFirst.mockResolvedValue(null); // number gen (legacy path)
    prisma.goodsReceipt.findMany.mockResolvedValue([]); // number gen (numeric-max path)
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.goodsReceipt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: GRN_ID, ...data }),
    );
    prisma.stockMovement.create.mockResolvedValue({ id: 'mov-1' });
    prisma.goodsReceiptLine.create.mockResolvedValue({ id: 'line-1' });
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    prisma.stock.update.mockResolvedValue({});
    prisma.stock.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrderLine.update.mockResolvedValue({});
    prisma.purchaseOrderLine.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrderLine.findMany.mockResolvedValue([
      { receivedQuantity: 10, orderedQuantity: 100 },
    ]);
    prisma.purchaseOrder.update.mockResolvedValue({});
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
    uom.calcAllQties.mockResolvedValue(ALLQ);
    uom.calcNewWAC.mockReturnValue({ newPurchaseQty: 10, newUnitCost: 2.5 });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: GRN_ID } as any);
  };

  const createDto = (over: Record<string, any> = {}): any => ({
    poId: PO_A,
    warehouseId: WH,
    lines: [{ itemId: ITEM, poLineId: POL, receivedQuantity: 10, uom: 'KG', unitCost: 2.5 }],
    ...over,
  });

  // ── Reads: tenant scoping ──────────────────────────────────────────────────

  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.goodsReceipt.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findOne throws NotFoundException when the GRN is in another tenant', async () => {
    prisma.goodsReceipt.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, GRN_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.goodsReceipt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('findByPo scopes the query to tenantId + poId + deletedAt: null', async () => {
    prisma.goodsReceipt.findMany.mockResolvedValue([]);
    await service.findByPo(TENANT_A, PO_A);
    expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          poId: PO_A,
          deletedAt: null,
        }),
      }),
    );
  });

  // ── Response format ────────────────────────────────────────────────────────

  it('[GAP] findAll returns the { goodsReceipts, count } envelope', async () => {
    prisma.goodsReceipt.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A);
    expect(res).toHaveProperty('goodsReceipts');
    expect(res).toHaveProperty('count');
  });

  it('[GAP] findByPo returns the { goodsReceipts, count } envelope', async () => {
    prisma.goodsReceipt.findMany.mockResolvedValue([]);
    const res: any = await service.findByPo(TENANT_A, PO_A);
    expect(res).toHaveProperty('goodsReceipts');
    expect(res).toHaveProperty('count');
  });

  // ── Create: validation + error paths (existing behavior) ─────────────────

  it('create throws NotFoundException when the warehouse is missing/other-tenant', async () => {
    setupCreateMocks();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  it('create throws BadRequestException when the PO is cancelled', async () => {
    setupCreateMocks();
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: PO_A, status: 'cancelled' });
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(BadRequestException);
  });

  it('create throws NotFoundException when a line item is missing/other-tenant', async () => {
    setupCreateMocks();
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  // ── Create: tenant scoping of PO-line reads/writes (spec-023 criticals) ──

  it('[GAP] create scopes the poLineId lookup by tenantId', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.purchaseOrderLine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] create increments PO line receivedQuantity via tenant-scoped updateMany', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.purchaseOrderLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: POL, tenantId: TENANT_A }),
      }),
    );
  });

  it('[GAP] create scopes the PO-status rollup line query by tenantId', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.purchaseOrderLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A }),
      }),
    );
  });

  it('[GAP] resolveSupplierID PO lookup filters deletedAt: null', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    // Every purchaseOrder.findFirst in the create path must carry deletedAt: null
    for (const call of prisma.purchaseOrder.findFirst.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ deletedAt: null }));
    }
  });

  // ── Create: PO linkage integrity ───────────────────────────────────────────

  it('[GAP] create rejects a poLineId that does not belong to the header poId', async () => {
    setupCreateMocks();
    prisma.purchaseOrderLine.findFirst.mockResolvedValue({
      id: POL,
      purchaseOrderId: 'another-po-entirely',
      orderedQuantity: 100,
      receivedQuantity: 0,
    });
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(BadRequestException);
  });

  it('[GAP] create rejects over-receipt beyond the PO line orderedQuantity', async () => {
    setupCreateMocks();
    prisma.purchaseOrderLine.findFirst.mockResolvedValue({
      id: POL,
      purchaseOrderId: PO_A,
      orderedQuantity: 100,
      receivedQuantity: 95, // 95 received + 10 incoming = 105 > 100
    });
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(BadRequestException);
  });

  // ── Create: document numbering ─────────────────────────────────────────────

  it('[GAP] grnNumber comes from the NUMERIC max, spanning soft-deleted rows', async () => {
    setupCreateMocks();
    // String sort would pick "999"; numeric max must pick 1000 → next is 1001.
    prisma.goodsReceipt.findMany.mockResolvedValue([
      { grnNumber: `GRN-${YEAR}-999` },
      { grnNumber: `GRN-${YEAR}-1000` },
    ]);
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.goodsReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ grnNumber: `GRN-${YEAR}-1001` }),
      }),
    );
  });

  it('[GAP] movementNumber comes from the NUMERIC max', async () => {
    setupCreateMocks();
    prisma.stockMovement.findMany.mockResolvedValue([
      { movementNumber: `MOV-${YEAR}-999` },
      { movementNumber: `MOV-${YEAR}-1000` },
    ]);
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ movementNumber: `MOV-${YEAR}-1001` }),
      }),
    );
  });

  it('[GAP] a grnNumber P2002 collision maps to 409 ConflictException', async () => {
    setupCreateMocks();
    prisma.goodsReceipt.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── Create: stock & valuation invariants (must not regress) ───────────────

  it('create posts one receipt movement per line with the UOM-derived quantities', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(uom.calcAllQties).toHaveBeenCalledWith(10, ITEM, TENANT_A, undefined);
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          movementType: 'receipt',
          referenceType: 'GRN',
          quantity: ALLQ.storageQty,
          purchaseQty: ALLQ.purchaseQty,
          consumptionQty: ALLQ.consumptionQty,
          movementValue: 25, // 10 KG × 2.5
        }),
      }),
    );
  });

  it('create recomputes WAC through UomService.calcNewWAC on existing stock', async () => {
    setupCreateMocks();
    prisma.stock.findFirst.mockResolvedValue({
      id: 'stock-1',
      purchaseQty: 40,
      onHandQuantity: 40,
      unitCost: 2.0,
    });
    await service.create(TENANT_A, USER, createDto());
    expect(uom.calcNewWAC).toHaveBeenCalledWith(40, 2, ALLQ.purchaseQty, 2.5);
  });

  it('create starts new stock at the incoming cost when no stock row exists', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, unitCost: 2.5 }),
      }),
    );
  });

  // ── Update ─────────────────────────────────────────────────────────────────

  it('update throws BadRequestException when the GRN is cancelled', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: GRN_ID, status: 'cancelled' } as any);
    await expect(service.update(TENANT_A, USER, GRN_ID, { notes: 'x' } as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] update writes via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: GRN_ID, status: 'posted' } as any);
    prisma.goodsReceipt.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, GRN_ID, { notes: 'x' } as any);
    expect(prisma.goodsReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: GRN_ID,
          tenantId: TENANT_A,
          deletedAt: null,
        }),
      }),
    );
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────

  const cancelGrn = (over: Record<string, any> = {}) => ({
    id: GRN_ID,
    grnNumber: `GRN-${YEAR}-0001`,
    status: 'posted',
    warehouseId: WH,
    poId: PO_A,
    lines: [
      {
        itemId: ITEM,
        poLineId: POL,
        stockMovementId: 'mov-1',
        receivedQuantity: 10,
        uom: 'KG',
        storageQty: 10,
        storageUom: 'KG',
        consumptionQty: 10000,
        consumptionUom: 'G',
        unitCost: 2.5,
      },
    ],
    ...over,
  });

  const setupCancelMocks = () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(cancelGrn() as any);
    prisma.goodsReceipt.update.mockResolvedValue({});
    prisma.goodsReceipt.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovement.findFirst.mockResolvedValue({
      id: 'mov-1',
      unitCostAtMovement: 2.5,
    });
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.stockMovement.create.mockResolvedValue({ id: 'mov-2' });
    prisma.stock.findFirst.mockResolvedValue({
      id: 'stock-1',
      purchaseQty: 50,
      onHandQuantity: 50,
      unitCost: 2.5,
    });
    prisma.stock.update.mockResolvedValue({});
    prisma.stock.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrderLine.update.mockResolvedValue({});
    prisma.purchaseOrderLine.updateMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrderLine.findMany.mockResolvedValue([
      { receivedQuantity: 0, orderedQuantity: 100 },
    ]);
    prisma.purchaseOrder.update.mockResolvedValue({});
    prisma.purchaseOrder.updateMany.mockResolvedValue({ count: 1 });
  };

  it('cancel throws ConflictException when already cancelled', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(cancelGrn({ status: 'cancelled' }) as any);
    await expect(service.cancel(TENANT_A, USER, GRN_ID)).rejects.toThrow(ConflictException);
  });

  it('cancel throws ConflictException when stock was partially consumed', async () => {
    setupCancelMocks();
    prisma.stock.findFirst.mockResolvedValue({
      id: 'stock-1',
      purchaseQty: 5, // 5 available < 10 required to reverse
      onHandQuantity: 5,
      unitCost: 2.5,
    });
    await expect(service.cancel(TENANT_A, USER, GRN_ID)).rejects.toThrow(ConflictException);
  });

  it('cancel posts a negative adjustment movement at the original cost', async () => {
    setupCancelMocks();
    await service.cancel(TENANT_A, USER, GRN_ID);
    expect(prisma.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'adjustment',
          referenceType: 'GRN_CANCEL',
          quantity: -10,
          purchaseQty: -10,
          unitCost: 2.5,
          movementValue: -25,
        }),
      }),
    );
  });

  it('[GAP] cancel scopes the original-movement lookup by tenantId', async () => {
    setupCancelMocks();
    await service.cancel(TENANT_A, USER, GRN_ID);
    expect(prisma.stockMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'mov-1', tenantId: TENANT_A }),
      }),
    );
  });

  it('[GAP] cancel decrements PO line receivedQuantity via tenant-scoped updateMany', async () => {
    setupCancelMocks();
    await service.cancel(TENANT_A, USER, GRN_ID);
    expect(prisma.purchaseOrderLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: POL, tenantId: TENANT_A }),
      }),
    );
  });

  it('[GAP] cancel writes the GRN status via tenant-scoped updateMany', async () => {
    setupCancelMocks();
    await service.cancel(TENANT_A, USER, GRN_ID);
    expect(prisma.goodsReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: GRN_ID,
          tenantId: TENANT_A,
          deletedAt: null,
        }),
      }),
    );
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  it('getStats scopes every count by tenantId + deletedAt and returns the shape', async () => {
    prisma.goodsReceipt.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.$queryRaw.mockResolvedValue([{ total_value: 45210.5 }]);
    const res = await service.getStats(TENANT_A);
    expect(res).toEqual({
      total: 12,
      posted: 10,
      cancelled: 2,
      today: 1,
      totalValue: 45210.5,
    });
    for (const call of prisma.goodsReceipt.count.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      );
    }
  });

  // ── Architecture cleanup ───────────────────────────────────────────────────

  it('[GAP] dead duplicated getInventoryTurnover is removed from this service', () => {
    // Live implementation: stock-transactions.service.ts (spec-023 cleanup).
    expect((service as any).getInventoryTurnover).toBeUndefined();
  });
});
