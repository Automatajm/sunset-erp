// ============================================================================
// Unit tests for StockReconciliationService + StockCountAssignmentService —
// spec-017-stock-reconciliation
// PrismaService, UomService and StockTransactionsService are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { StockReconciliationService } from './stock-reconciliation.service';
import { StockCountAssignmentService } from './stock-count-assignment.service';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const USER_2 = '44444444-4444-4444-4444-444444444444';
const WH = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  delete: jest.fn().mockResolvedValue({}),
  deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const buildPrisma = () => ({
  stockCountSession: model(),
  stockCountLine: model(),
  stockCountAssignment: model(),
  stockMovement: model(),
  stock: model(),
  item: model(),
  warehouse: model(),
  warehouseAisle: model(),
  warehouseRack: model(),
  warehouseLevel: model(),
  userTenant: model(),
  $transaction: jest.fn(),
});

// A line fat enough for findOne's Number() serialization and post()'s math.
const countedLine = (over: Record<string, unknown> = {}) => ({
  id: 'ln-1',
  itemId: 'i1',
  status: 'counted',
  systemStorageQty: 100,
  systemPurchaseQty: 100,
  unitCostSnapshot: 10,
  countedStorageQty: 95,
  countedPurchaseQty: 95,
  varianceStorageQty: -5,
  variancePurchaseQty: -5,
  varianceValue: -50,
  storageUom: 'PCS',
  purchaseUom: 'PCS',
  lotNumber: null,
  serialNumber: null,
  levelId: null,
  binId: null,
  assignedToUserId: null,
  item: {},
  ...over,
});

const sessionRecord = (over: Record<string, unknown> = {}) => ({
  id: 'cs-1',
  tenantId: TENANT_A,
  sessionNumber: 'CC-2026-0001',
  status: 'draft',
  warehouseId: WH,
  warehouse: { id: WH, code: 'W1', name: 'W1' },
  totalVarianceValue: null,
  lines: [],
  ...over,
});

describe('StockReconciliationService', () => {
  let service: StockReconciliationService;
  let prisma: ReturnType<typeof buildPrisma>;
  let stx: { generateMovementNumber: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    );
    stx = { generateMovementNumber: jest.fn().mockResolvedValue('SM-2026-0099') };
    const uom = { calcAllQties: jest.fn(), calcNewWAC: jest.fn(), calcFinancialValue: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        StockReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: UomService, useValue: uom },
        { provide: StockTransactionsService, useValue: stx },
      ],
    }).compile();
    service = mod.get(StockReconciliationService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]) => a),
    ...m.updateMany.mock.calls.map(([a]) => a),
  ];

  // ── findAll / findOne ───────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.stockCountSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { sessions, count } envelope', async () => {
    prisma.stockCountSession.findMany.mockResolvedValue([sessionRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ sessions: expect.any(Array), count: 1 }));
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── create ──────────────────────────────────────────────────────────────────
  it('create throws 404 when the warehouse is not in the tenant', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, { warehouseId: WH } as never)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] create throws 400 when no stock positions match (no empty sessions)', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockCountSession.findFirst.mockResolvedValue(null); // number gen + findOne
    prisma.stock.findMany.mockResolvedValue([]);
    prisma.stockCountSession.create.mockResolvedValue(sessionRecord());
    await expect(service.create(TENANT_A, USER, { warehouseId: WH } as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create snapshots stock into lines with CC-YYYY-0001 and tenantId', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: WH });
    prisma.stockCountSession.findFirst.mockResolvedValueOnce(null); // number gen
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord()); // findOne refetch
    prisma.stock.findMany.mockResolvedValue([
      {
        itemId: 'i1',
        purchaseQty: 100,
        storageQty: 100,
        onHandQuantity: 100,
        unitCost: 10,
        storageUom: 'PCS',
        purchaseUom: 'PCS',
        lotNumber: null,
        serialNumber: null,
        item: { id: 'i1', baseUom: 'PCS' },
      },
    ]);
    prisma.stockCountSession.create.mockImplementation(({ data }) => ({ id: 'cs-1', ...data }));
    await service.create(TENANT_A, USER, { warehouseId: WH } as never);
    const created = prisma.stockCountSession.create.mock.calls[0][0].data;
    const year = new Date().getFullYear();
    expect(created.sessionNumber).toBe(`CC-${year}-0001`);
    expect(created.tenantId).toBe(TENANT_A);
    expect(created.status).toBe('draft');
    expect(created.lines.create[0]).toEqual(
      expect.objectContaining({ tenantId: TENANT_A, itemId: 'i1', status: 'pending' }),
    );
    expect(Number(created.lines.create[0].unitCostSnapshot)).toBe(10);
  });

  // ── startSession ────────────────────────────────────────────────────────────
  it('startSession throws 400 when the session is not draft', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'posted' }));
    await expect(service.startSession(TENANT_A, USER, 'cs-1')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] startSession write is tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await service.startSession(TENANT_A, USER, 'cs-1');
    expect(writesOf(prisma.stockCountSession).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  // ── updateLine ──────────────────────────────────────────────────────────────
  const inProgress = () => sessionRecord({ status: 'in_progress' });

  it('updateLine throws 400 when the session is not in_progress', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await expect(
      service.updateLine(TENANT_A, USER, 'cs-1', { lineId: 'ln-1', countedStorageQty: 5 } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('updateLine throws 404 when the line does not belong to the session/tenant', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(inProgress());
    prisma.stockCountLine.findFirst.mockResolvedValue(null);
    await expect(
      service.updateLine(TENANT_A, USER, 'cs-1', { lineId: 'ln-x', countedStorageQty: 5 } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] updateLine rejects BOTH countedStorageQty and countedPurchaseQty with 400', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(inProgress());
    prisma.stockCountLine.findFirst.mockResolvedValue(countedLine({ status: 'pending' }));
    prisma.item.findFirst.mockResolvedValue({
      storageToConsumptionFactor: 1,
      purchaseToConsumptionFactor: 1,
    });
    await expect(
      service.updateLine(TENANT_A, USER, 'cs-1', {
        lineId: 'ln-1',
        countedStorageQty: 5,
        countedPurchaseQty: 5,
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('updateLine computes SIGNED variances at the snapshot cost', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(inProgress());
    prisma.stockCountLine.findFirst.mockResolvedValue(countedLine({ status: 'pending' }));
    prisma.item.findFirst.mockResolvedValue({
      storageToConsumptionFactor: 1,
      purchaseToConsumptionFactor: 1,
    });
    await service.updateLine(TENANT_A, USER, 'cs-1', {
      lineId: 'ln-1',
      countedStorageQty: 95,
    } as never);
    const write = writesOf(prisma.stockCountLine).find((c) => c?.data?.status === 'counted');
    expect(Number(write.data.varianceStorageQty)).toBe(-5);
    expect(Number(write.data.varianceValue)).toBe(-50); // -5 × WAC 10, signed
  });

  it('[GAP] updateLine line-write is tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(inProgress());
    prisma.stockCountLine.findFirst.mockResolvedValue(countedLine({ status: 'pending' }));
    prisma.item.findFirst.mockResolvedValue({
      storageToConsumptionFactor: 1,
      purchaseToConsumptionFactor: 1,
    });
    await service.updateLine(TENANT_A, USER, 'cs-1', {
      lineId: 'ln-1',
      countedStorageQty: 95,
    } as never);
    expect(writesOf(prisma.stockCountLine).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('[GAP] updateLine item factor read includes deletedAt: null', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(inProgress());
    prisma.stockCountLine.findFirst.mockResolvedValue(countedLine({ status: 'pending' }));
    prisma.item.findFirst.mockResolvedValue({
      storageToConsumptionFactor: 1,
      purchaseToConsumptionFactor: 1,
    });
    await service.updateLine(TENANT_A, USER, 'cs-1', {
      lineId: 'ln-1',
      countedStorageQty: 95,
    } as never);
    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  // ── submitForApproval ───────────────────────────────────────────────────────
  it('submit throws 400 while uncounted lines remain', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(
      sessionRecord({ status: 'in_progress', lines: [countedLine({ status: 'pending' })] }),
    );
    await expect(service.submitForApproval(TENANT_A, USER, 'cs-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('submit computes the signed variance summary', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(
      sessionRecord({
        status: 'in_progress',
        lines: [
          countedLine(),
          countedLine({ id: 'ln-2', variancePurchaseQty: 0, varianceValue: 0 }),
        ],
      }),
    );
    await service.submitForApproval(TENANT_A, USER, 'cs-1');
    const write = writesOf(prisma.stockCountSession).find(
      (c) => c?.data?.status === 'pending_approval',
    );
    expect(write.data.linesWithVariance).toBe(1);
    expect(write.data.totalLinesCount).toBe(2);
    expect(Number(write.data.totalVarianceValue)).toBe(-50);
  });

  it('[GAP] submit write is tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(
      sessionRecord({ status: 'in_progress', lines: [countedLine()] }),
    );
    await service.submitForApproval(TENANT_A, USER, 'cs-1');
    expect(writesOf(prisma.stockCountSession).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  // ── approve / cancel ────────────────────────────────────────────────────────
  it('approve throws 400 when not pending_approval', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await expect(service.approve(TENANT_A, USER, 'cs-1', {} as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] approve write is tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(
      sessionRecord({ status: 'pending_approval' }),
    );
    await service.approve(TENANT_A, USER, 'cs-1', {} as never);
    expect(writesOf(prisma.stockCountSession).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  it('cancel throws 400 on a posted session', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'posted' }));
    await expect(service.cancel(TENANT_A, USER, 'cs-1')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] cancel write is tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await service.cancel(TENANT_A, USER, 'cs-1');
    expect(writesOf(prisma.stockCountSession).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  // ── post ────────────────────────────────────────────────────────────────────
  const approvedSession = () =>
    sessionRecord({ status: 'approved', lines: [countedLine({ status: 'counted' })] });

  it('post throws 400 when the session is not approved', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await expect(service.post(TENANT_A, USER, 'cs-1')).rejects.toThrow(BadRequestException);
  });

  it('post creates a signed CYCLE_COUNT adjustment and applies the stock delta', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(approvedSession());
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({ id: 'st-1', purchaseQty: 100, storageQty: 100 });
    await service.post(TENANT_A, USER, 'cs-1');
    const mv = prisma.stockMovement.create.mock.calls[0][0].data;
    expect(mv.movementType).toBe('adjustment');
    expect(mv.referenceType).toBe('CYCLE_COUNT');
    expect(Number(mv.movementValue)).toBe(-50); // signed: shortage
    expect(mv.fromWarehouseId).toBe(WH); // shortage → stock going out
    expect(mv.toWarehouseId).toBeNull();
    const stockWrite = writesOf(prisma.stock)[0];
    expect(Number(stockWrite.data.storageQty)).toBe(95); // 100 − 5
    const lineWrite = writesOf(prisma.stockCountLine).find((c) => c?.data?.status === 'adjusted');
    expect(lineWrite.data.adjustmentMovementId).toBe('mv-1');
  });

  it('[GAP] post obtains movement numbers from StockTransactionsService (tx-aware)', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(approvedSession());
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({ id: 'st-1', purchaseQty: 100, storageQty: 100 });
    await service.post(TENANT_A, USER, 'cs-1');
    expect(stx.generateMovementNumber).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  it('[GAP] post maps Prisma P2002 (movement-number race) to ConflictException', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(approvedSession());
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.post(TENANT_A, USER, 'cs-1')).rejects.toThrow(ConflictException);
  });

  it('[GAP] post stock/line/session writes are tenant-scoped at the write itself', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(approvedSession());
    prisma.stockMovement.findFirst.mockResolvedValue(null);
    prisma.stockMovement.create.mockImplementation(({ data }) => ({ id: 'mv-1', ...data }));
    prisma.stock.findFirst.mockResolvedValue({ id: 'st-1', purchaseQty: 100, storageQty: 100 });
    await service.post(TENANT_A, USER, 'cs-1');
    for (const m of [prisma.stock, prisma.stockCountLine, prisma.stockCountSession]) {
      expect(writesOf(m).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
    }
  });
});

describe('StockCountAssignmentService', () => {
  let service: StockCountAssignmentService;
  let prisma: ReturnType<typeof buildPrisma>;

  const sessionWithLines = () =>
    sessionRecord({
      status: 'in_progress',
      lines: [
        countedLine({ id: 'l1', itemId: 'i1', item: { id: 'i1', categoryId: 'c1' } }),
        countedLine({ id: 'l2', itemId: 'i2', item: { id: 'i2', categoryId: 'c2' } }),
      ],
    });

  beforeEach(async () => {
    prisma = buildPrisma();
    const mod = await Test.createTestingModule({
      providers: [StockCountAssignmentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(StockCountAssignmentService);
  });

  it('create throws 404 for an unknown session and 400 when not in_progress', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(null);
    await expect(
      service.create(TENANT_A, USER, 'cs-x', { userId: USER_2 } as never),
    ).rejects.toThrow(NotFoundException);
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionRecord({ status: 'draft' }));
    await expect(
      service.create(TENANT_A, USER, 'cs-1', { userId: USER_2 } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] create rejects a userId that is not an active tenant member with 404', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionWithLines());
    prisma.stockCountAssignment.findMany.mockResolvedValue([]);
    prisma.userTenant.findFirst.mockResolvedValue(null); // not a member
    prisma.stockCountAssignment.create.mockImplementation(({ data }) => ({ id: 'as', ...data }));
    await expect(
      service.create(TENANT_A, USER, 'cs-1', { userId: USER_2 } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('create resolves unassigned lines, skipping lines already assigned elsewhere', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionWithLines());
    prisma.stockCountAssignment.findMany.mockResolvedValue([{ assignedLineIds: ['l2'] }]);
    prisma.userTenant.findFirst.mockResolvedValue({ userId: USER_2, isActive: true });
    prisma.stockCountAssignment.create.mockImplementation(({ data }) => ({ id: 'as', ...data }));
    const result: any = await service.create(TENANT_A, USER, 'cs-1', {
      userId: USER_2,
    } as never);
    expect(result.resolvedCount).toBe(1);
    expect(prisma.stockCountAssignment.create.mock.calls[0][0].data.assignedLineIds).toEqual([
      'l1',
    ]);
  });

  it('create throws 400 when no unassigned lines match the filters', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionWithLines());
    prisma.stockCountAssignment.findMany.mockResolvedValue([{ assignedLineIds: ['l1', 'l2'] }]);
    prisma.userTenant.findFirst.mockResolvedValue({ userId: USER_2, isActive: true });
    await expect(
      service.create(TENANT_A, USER, 'cs-1', { userId: USER_2 } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] the line-assign updateMany includes tenantId', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionWithLines());
    prisma.stockCountAssignment.findMany.mockResolvedValue([]);
    prisma.userTenant.findFirst.mockResolvedValue({ userId: USER_2, isActive: true });
    prisma.stockCountAssignment.create.mockImplementation(({ data }) => ({ id: 'as', ...data }));
    await service.create(TENANT_A, USER, 'cs-1', { userId: USER_2 } as never);
    expect(
      prisma.stockCountLine.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A),
    ).toBe(true);
  });

  it('[GAP] preview performs the real dry-run resolution without persisting', async () => {
    prisma.stockCountSession.findFirst.mockResolvedValue(sessionWithLines());
    prisma.stockCountAssignment.findMany.mockResolvedValue([]);
    const result: any = await service.preview(TENANT_A, 'cs-1', {
      userId: USER_2,
      itemIds: ['i1'],
    } as never);
    expect(result.matchedLines).toBe(1); // only l1 matches the itemIds filter
    expect(prisma.stockCountAssignment.create).not.toHaveBeenCalled();
  });

  it('remove throws 404 for an unknown assignment', async () => {
    prisma.stockCountAssignment.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_A, 'cs-1', 'as-x')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove releases lines and deletes with tenant-scoped writes', async () => {
    prisma.stockCountAssignment.findFirst.mockResolvedValue({
      id: 'as-1',
      assignedLineIds: ['l1', 'l2'],
    });
    const result: any = await service.remove(TENANT_A, 'cs-1', 'as-1');
    expect(result.releasedLines).toBe(2);
    expect(
      prisma.stockCountLine.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A),
    ).toBe(true);
    const scopedDelete =
      prisma.stockCountAssignment.deleteMany.mock.calls.some(
        ([a]) => a?.where?.tenantId === TENANT_A,
      ) ||
      prisma.stockCountAssignment.delete.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scopedDelete).toBe(true);
  });
});
