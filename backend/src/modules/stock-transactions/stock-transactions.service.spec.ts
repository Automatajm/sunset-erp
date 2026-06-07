// ============================================================================
// Unit tests for StockTransactionsService — spec-016-stock-transactions
// PrismaService and UomService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { StockTransactionsService } from './stock-transactions.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UomService } from '../uom/uom.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ITEM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WH = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  groupBy: jest.fn().mockResolvedValue([]),
});

const receiptDto = (over: Record<string, unknown> = {}) =>
  ({
    transactionType: 'receipt',
    itemId: ITEM,
    warehouseId: WH,
    quantity: 100,
    uom: 'PCS',
    ...over,
  }) as never;

// A movement record fat enough for findOne's Number() serialization.
const movementRecord = (over: Record<string, unknown> = {}) => ({
  id: 'mv-1',
  movementNumber: 'SM-2026-0001',
  movementType: 'receipt',
  quantity: 100,
  purchaseQty: 100,
  consumptionQty: 100,
  movementValue: null,
  item: null,
  fromWarehouse: null,
  toWarehouse: null,
  ...over,
});

// A ledger-shaped movement for getLedger inputs.
const ledgerMovement = (refType: string, refId: string) => ({
  id: `mv-${refId}`,
  movementNumber: 'SM-2026-0001',
  movementType: 'receipt',
  movementDate: new Date('2026-06-01'),
  itemId: 'i1',
  fromWarehouseId: null,
  toWarehouseId: 'w1',
  quantity: 10,
  purchaseQty: 10,
  consumptionQty: 10,
  uom: 'PCS',
  purchaseUom: 'PCS',
  consumptionUom: 'PCS',
  unitCost: 1,
  movementValue: null,
  referenceType: refType,
  referenceId: refId,
  notes: null,
  item: { id: 'i1', code: 'X', name: 'X', itemType: 'raw_material', baseUom: 'PCS' },
  fromWarehouse: null,
  toWarehouse: { id: 'w1', code: 'W1', name: 'W1' },
});

describe('StockTransactionsService', () => {
  let service: StockTransactionsService;
  let prisma: Record<string, any>;
  let uom: Record<string, jest.Mock>;

  beforeEach(async () => {
    prisma = {
      stockMovement: model(),
      stock: model(),
      item: model(),
      warehouse: model(),
      stockCountSession: model(),
      arInvoice: model(),
      apInvoice: model(),
      purchaseOrder: model(),
      goodsReceipt: model(),
      purchaseOrderLine: model(),
      salesOrderLine: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    uom = {
      // Identity conversion: 1 purchase = 1 storage = 1 consumption unit.
      calcAllQties: jest.fn(async (qty: number) => ({
        purchaseQty: qty,
        purchaseUom: 'PCS',
        storageQty: qty,
        storageUom: 'PCS',
        consumptionQty: qty,
        consumptionUom: 'PCS',
      })),
      calcNewWAC: jest.fn(() => ({ newUnitCost: 15, newPurchaseQty: 200 })),
      calcFinancialValue: jest.fn(() => 0),
    };
    const mod = await Test.createTestingModule({
      providers: [
        StockTransactionsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { safeQueue: jest.fn(), safeQueueOnce: jest.fn() },
        },
        { provide: UomService, useValue: uom },
      ],
    }).compile();
    service = mod.get(StockTransactionsService);
  });

  const stockWriteCalls = () => [
    ...prisma.stock.update.mock.calls.map(([a]: [any]) => a),
    ...prisma.stock.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  // ── create — guards ─────────────────────────────────────────────────────────
  it('create throws 404 when the item is not in the tenant (scoped check)', async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, receiptDto())).rejects.toThrow(NotFoundException);
    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ITEM, tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('create throws 404 when the warehouse is not in the tenant', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_A, USER, receiptDto())).rejects.toThrow(NotFoundException);
  });

  it('[GAP] create rejects transactionType transfer/adjustment with 400 (no phantom receipts)', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => movementRecord(data));
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    await expect(
      service.create(TENANT_A, USER, receiptDto({ transactionType: 'transfer' })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(TENANT_A, USER, receiptDto({ transactionType: 'adjustment' })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── create — happy paths ────────────────────────────────────────────────────
  it('create receipt assigns SM-YYYY-0001, stamps tenantId, creates the Stock row when none exists', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValueOnce(null); // number gen
    prisma.stockMovement.findFirst.mockResolvedValue(movementRecord()); // findOne refetch
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    const result: any = await service.create(TENANT_A, USER, receiptDto({ unitCost: 10 }));
    const year = new Date().getFullYear();
    const created = prisma.stockMovement.create.mock.calls[0][0].data;
    expect(created.movementNumber).toBe(`SM-${year}-0001`);
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.toWarehouseId).toBe(WH); // receipt → to, not from
    expect(prisma.stock.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
    expect(result.movementNumber).toBe('SM-2026-0001');
  });

  it('create receipt with unitCost on existing stock recomputes WAC via UomService.calcNewWAC', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValueOnce(null);
    prisma.stockMovement.findFirst.mockResolvedValue(movementRecord());
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({
      id: 'st-1',
      purchaseQty: 100,
      onHandQuantity: 100,
      storageQty: 100,
      unitCost: 10,
    });
    prisma.stock.update.mockResolvedValue({});
    await service.create(TENANT_A, USER, receiptDto({ quantity: 100, unitCost: 20 }));
    expect(uom.calcNewWAC).toHaveBeenCalledWith(100, 10, 100, 20);
    const write = stockWriteCalls().find((c) => c?.data?.unitCost !== undefined);
    expect(Number(write.data.unitCost)).toBe(15);
  });

  it('generateMovementNumber increments from the latest tenant-scoped number', async () => {
    const year = new Date().getFullYear();
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValueOnce({
      movementNumber: `SM-${year}-0042`,
    });
    prisma.stockMovement.findFirst.mockResolvedValue(movementRecord());
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    await service.create(TENANT_A, USER, receiptDto());
    expect(prisma.stockMovement.create.mock.calls[0][0].data.movementNumber).toBe(
      `SM-${year}-0043`,
    );
    const [numberQuery] = prisma.stockMovement.findFirst.mock.calls[0];
    expect(numberQuery.where.tenantId).toBe(TENANT_A);
  });

  // ── create — stock integrity ([GAP]) ────────────────────────────────────────
  it('[GAP] issue greater than on-hand storageQty throws 400 (stock never goes negative)', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({
      id: 'st-1',
      purchaseQty: 10,
      onHandQuantity: 10,
      storageQty: 10,
      unitCost: 5,
    });
    prisma.stock.update.mockResolvedValue({});
    await expect(
      service.create(TENANT_A, USER, receiptDto({ transactionType: 'issue', quantity: 50 })),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] issue against a missing Stock row throws 400 (available 0), never creates stock', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    await expect(
      service.create(TENANT_A, USER, receiptDto({ transactionType: 'issue', quantity: 10 })),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.stock.create).not.toHaveBeenCalled();
  });

  it('[GAP] create maps Prisma P2002 (movementNumber race) to ConflictException', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, receiptDto())).rejects.toThrow(ConflictException);
  });

  it('[GAP] the stock write in create is tenant-scoped at the write itself', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockMovement.findFirst.mockResolvedValueOnce(null);
    prisma.stockMovement.findFirst.mockResolvedValue(movementRecord());
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({
      id: 'st-1',
      purchaseQty: 100,
      onHandQuantity: 100,
      storageQty: 100,
      unitCost: 10,
    });
    prisma.stock.update.mockResolvedValue({});
    await service.create(TENANT_A, USER, receiptDto({ unitCost: 20 }));
    expect(stockWriteCalls().some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────
  it('findAll scopes the movement query to tenantId', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('[GAP] findAll applies the warehouseId filter (from/to OR-match)', async () => {
    await service.findAll(TENANT_A, { warehouseId: WH });
    const [arg] = prisma.stockMovement.findMany.mock.calls[0];
    expect(arg.where.OR).toEqual(
      expect.arrayContaining([{ fromWarehouseId: WH }, { toWarehouseId: WH }]),
    );
  });

  it('[GAP] findAll returns the { movements, count } envelope', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      movementRecord(),
      movementRecord({ id: 'mv-2' }),
    ]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ movements: expect.any(Array), count: 2 }));
  });

  it('[GAP] findAll cycle-count reference lookup includes tenantId', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      movementRecord({ referenceType: 'CYCLE_COUNT', referenceId: 'cc-1' }),
    ]);
    prisma.stockCountSession.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.stockCountSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  // ── findOne ─────────────────────────────────────────────────────────────────
  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
    expect(prisma.stockMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_B }) }),
    );
  });

  // ── getLedger — reference lookups ([GAP]) ───────────────────────────────────
  it('[GAP] all five ledger reference lookups include tenantId', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      ledgerMovement('ar_invoice', 'r1'),
      ledgerMovement('ap_invoice', 'r2'),
      ledgerMovement('purchase_order', 'r3'),
      ledgerMovement('GRN', 'r4'),
      ledgerMovement('CYCLE_COUNT', 'r5'),
    ]);
    await service.getLedger(TENANT_A);
    for (const key of [
      'arInvoice',
      'apInvoice',
      'purchaseOrder',
      'goodsReceipt',
      'stockCountSession',
    ]) {
      expect(prisma[key].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
      );
    }
  });

  it('getLedger computes a signed running balance per item/warehouse', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      ledgerMovement('opening_balance', 'ob'),
      {
        ...ledgerMovement('opening_balance', 'ob2'),
        movementType: 'issue',
        quantity: 4,
        purchaseQty: 4,
        fromWarehouseId: 'w1',
        toWarehouseId: null,
      },
    ]);
    const result: any = await service.getLedger(TENANT_A);
    expect(result.rows[0].closingBalance).toBe(10);
    expect(result.rows[1].signedQuantity).toBe(-4);
    expect(result.rows[1].closingBalance).toBe(6);
    expect(result.totals.netMovement).toBe(6);
    expect(result.count).toBe(2);
  });

  // ── getStockBalance ─────────────────────────────────────────────────────────
  it('getStockBalance scopes to tenantId and computes availableQty = storage − reserved', async () => {
    prisma.stock.findMany.mockResolvedValue([
      {
        id: 'st-1',
        purchaseQty: 10,
        storageQty: 100,
        consumptionQty: 1000,
        onHandQuantity: 100,
        reservedQuantity: 30,
        unitCost: 4,
        purchaseUom: 'BOX',
        storageUom: 'PCS',
        consumptionUom: 'G',
        item: {
          storageToConsumptionFactor: 1,
          purchaseToConsumptionFactor: 1,
          baseUom: 'PCS',
          purchaseUom: null,
          storageUom: null,
          consumptionUom: null,
        },
        warehouse: { id: WH },
      },
    ]);
    const result: any = await service.getStockBalance(TENANT_A);
    expect(prisma.stock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
    expect(result[0].availableQty).toBe(70);
    expect(result[0].totalValue).toBe(40); // purchaseQty 10 × unitCost 4
  });
});
