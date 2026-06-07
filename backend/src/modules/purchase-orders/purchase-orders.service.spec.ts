// ============================================================================
// Unit tests for PurchaseOrdersService — spec-020-procurement-cluster
// PrismaService (and StockTransactionsService once injected) are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const SUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ITEM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WH = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

type ModelMock = Record<string, jest.Mock>;
const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const poLine = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  itemId: ITEM,
  orderedQuantity: 100,
  receivedQuantity: 0,
  unitPrice: 10,
  status: 'open',
  item: { id: ITEM, code: 'ITM' },
  ...over,
});

const poRecord = (over: Record<string, unknown> = {}) => ({
  id: 'po-1',
  tenantId: TENANT_A,
  poNumber: 'PO-2026-0001',
  status: 'draft',
  supplierId: SUP,
  supplier: { id: SUP, code: 'SUP-2026-0001', name: 'Acme' },
  lines: [poLine()],
  ...over,
});

const createDto = (over: Record<string, unknown> = {}) =>
  ({
    supplierId: SUP,
    lines: [{ itemId: ITEM, orderedQuantity: 100, uom: 'PCS', unitPrice: 10 }],
    ...over,
  }) as never;

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let prisma: Record<string, any>;
  let stx: { generateMovementNumber: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchaseOrder: model(),
      purchaseOrderLine: model(),
      supplier: model(),
      item: model(),
      warehouse: model(),
      stock: model(),
      stockMovement: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    stx = { generateMovementNumber: jest.fn().mockResolvedValue('SM-2026-0099') };
    const mod = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { safeQueue: jest.fn(), safeQueueOnce: jest.fn() },
        },
        { provide: StockTransactionsService, useValue: stx },
      ],
    }).compile();
    service = mod.get(PurchaseOrdersService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]: [any]) => a),
    ...m.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  // ── create ──────────────────────────────────────────────────────────────────
  it('create validates supplier and items in-tenant (404 otherwise)', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  it('[GAP] generatePoNumber uses numeric max over findMany (not lexicographic findFirst)', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    const year = new Date().getFullYear();
    // numeric max must pick 105, not lexicographic '99'
    prisma.purchaseOrder.findMany.mockResolvedValue([
      { poNumber: `PO-${year}-99` },
      { poNumber: `PO-${year}-105` },
    ]);
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.create.mockImplementation(({ data }: any) => poRecord(data));
    await service.create(TENANT_A, USER, createDto());
    const created = prisma.purchaseOrder.create.mock.calls[0][0].data;
    expect(created.poNumber).toBe(`PO-${year}-0106`);
  });

  it('[GAP] create maps Prisma P2002 (poNumber race) to ConflictException', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    prisma.purchaseOrder.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── reads / envelope ────────────────────────────────────────────────────────
  it('[GAP] findAll returns the { purchaseOrders, count } envelope', async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([poRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ purchaseOrders: expect.any(Array), count: 1 }),
    );
  });

  it('findOne throws 404 for an id owned by another tenant', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── scoped writes ([GAP] ×5) ────────────────────────────────────────────────
  it('[GAP] update / updateStatus / remove writes are tenant-scoped at the write itself', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(poRecord());
    prisma.purchaseOrder.update.mockResolvedValue(poRecord());
    await service.update(TENANT_A, USER, 'po-1', { notes: 'X' } as never);
    await service.updateStatus(TENANT_A, USER, 'po-1', 'confirmed');
    await service.remove(TENANT_A, USER, 'po-1');
    const scoped = writesOf(prisma.purchaseOrder).filter((c) => c?.where?.tenantId === TENANT_A);
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });

  // ── state machine (completed map; receive routes through it) ───────────────
  it('updateStatus rejects an illegal transition (draft → received) with 400', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(poRecord({ status: 'draft' }));
    await expect(service.updateStatus(TENANT_A, USER, 'po-1', 'received')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('updateStatus rejects an unknown target with 400', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(poRecord({ status: 'draft' }));
    await expect(service.updateStatus(TENANT_A, USER, 'po-1', 'banana')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── receive ([GAP] tx + shared SM generator + scoped writes) ────────────────
  const confirmedPo = () => poRecord({ status: 'confirmed' });
  const receiveDto = (qty = 50) =>
    ({
      warehouseId: WH,
      lines: [{ lineId: 'pol-1', receivedQuantity: qty, unitCost: 10 }],
    }) as never;

  const happyReceiveMocks = () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(confirmedPo());
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.purchaseOrderLine.findMany.mockResolvedValue([
      poLine({ receivedQuantity: 50, orderedQuantity: 100 }),
    ]);
    prisma.stock.findFirst.mockResolvedValue(null);
    prisma.stock.create.mockResolvedValue({});
    prisma.stockMovement.create.mockImplementation(({ data }: any) => ({ id: 'mv', ...data }));
    prisma.stockMovement.findFirst.mockResolvedValue(null);
  };

  it('receive guards: 400 on non-receivable status; 400 on over-receive', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(poRecord({ status: 'draft' }));
    await expect(service.receive(TENANT_A, USER, 'po-1', receiveDto())).rejects.toThrow(
      BadRequestException,
    );
    prisma.purchaseOrder.findFirst.mockResolvedValue(confirmedPo());
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    await expect(service.receive(TENANT_A, USER, 'po-1', receiveDto(150))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] receive runs inside a single $transaction', async () => {
    happyReceiveMocks();
    await service.receive(TENANT_A, USER, 'po-1', receiveDto());
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('[GAP] receive obtains movement numbers from StockTransactionsService (tx-aware)', async () => {
    happyReceiveMocks();
    await service.receive(TENANT_A, USER, 'po-1', receiveDto());
    expect(stx.generateMovementNumber).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  it('[GAP] receive line + PO + stock writes are tenant-scoped at the write itself', async () => {
    happyReceiveMocks();
    await service.receive(TENANT_A, USER, 'po-1', receiveDto());
    for (const m of [prisma.purchaseOrderLine, prisma.purchaseOrder]) {
      expect(writesOf(m).some((c: any) => c?.where?.tenantId === TENANT_A)).toBe(true);
    }
  });

  it('[GAP] receive sets partially_received via the completed map (50 of 100 received)', async () => {
    happyReceiveMocks();
    await service.receive(TENANT_A, USER, 'po-1', receiveDto());
    const statusWrite = writesOf(prisma.purchaseOrder).find(
      (c: any) => c?.data?.status === 'partially_received',
    );
    expect(statusWrite).toBeTruthy();
  });
});
