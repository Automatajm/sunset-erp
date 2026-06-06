// ============================================================================
// Unit tests for ProductionPlansService — spec-019-production-cluster
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ProductionPlansService } from './production-plans.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ITEM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MO = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const planLine = (over: Record<string, unknown> = {}) => ({
  id: 'ln-1',
  lineNumber: 1,
  itemId: ITEM,
  bomId: BOM,
  status: 'pending',
  plannedQty: 100,
  producedQty: 0,
  uom: 'PCS',
  plannedStart: new Date('2026-07-07'),
  plannedEnd: new Date('2026-07-14'),
  soLineId: null,
  item: { id: ITEM, code: 'ITM', name: 'Item' },
  productionOrders: [],
  ...over,
});

const planRecord = (over: Record<string, unknown> = {}) => ({
  id: 'pp-1',
  tenantId: TENANT_A,
  planNumber: 'PP-2026-0001',
  title: 'July run',
  horizon: 'monthly',
  status: 'draft',
  crpStatus: null,
  periodStart: new Date('2026-07-01'),
  periodEnd: new Date('2026-07-31'),
  lines: [planLine()],
  ...over,
});

const createDto = (over: Record<string, unknown> = {}) =>
  ({
    title: 'July run',
    horizon: 'monthly',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    lines: [
      {
        itemId: ITEM,
        plannedQty: 1000,
        uom: 'PCS',
        plannedStart: '2026-07-07',
        plannedEnd: '2026-07-14',
      },
    ],
    ...over,
  }) as never;

describe('ProductionPlansService', () => {
  let service: ProductionPlansService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      productionPlan: model(),
      productionPlanLine: model(),
      productionOrder: model(),
      item: model(),
      bom: model(),
      salesOrderLine: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    const mod = await Test.createTestingModule({
      providers: [ProductionPlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ProductionPlansService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]: [any]) => a),
    ...m.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  // ── create ──────────────────────────────────────────────────────────────────
  it('create throws 404 when a line item is not in the tenant', async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  it('create auto-resolves the active BOM (highest version) when bomId is omitted', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.bom.findFirst.mockResolvedValue({ id: BOM, version: 3 });
    prisma.productionPlan.findFirst.mockResolvedValue(null); // number gen
    prisma.productionPlan.create.mockImplementation(({ data }) => planRecord(data));
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.bom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          parentItemId: ITEM,
          isActive: true,
          deletedAt: null,
        }),
        orderBy: expect.objectContaining({ version: 'desc' }),
      }),
    );
    const created = prisma.productionPlan.create.mock.calls[0][0].data;
    expect(created.lines.create[0].bomId).toBe(BOM);
    expect(created.planNumber).toBe(`PP-${new Date().getFullYear()}-0001`);
    expect(created.tenantId).toBe(TENANT_A);
  });

  it('create throws 404 when an explicit bomId is not in the tenant', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.create(
        TENANT_A,
        USER,
        createDto({
          lines: [
            {
              itemId: ITEM,
              bomId: BOM,
              plannedQty: 10,
              uom: 'PCS',
              plannedStart: '2026-07-07',
              plannedEnd: '2026-07-14',
            },
          ],
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] the soLineId validation includes deletedAt: null', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.bom.findFirst.mockResolvedValue({ id: BOM });
    prisma.salesOrderLine.findFirst.mockResolvedValue({ id: 'sol-1' });
    prisma.productionPlan.findFirst.mockResolvedValue(null);
    prisma.productionPlan.create.mockImplementation(({ data }) => planRecord(data));
    await service.create(
      TENANT_A,
      USER,
      createDto({
        lines: [
          {
            itemId: ITEM,
            plannedQty: 10,
            uom: 'PCS',
            plannedStart: '2026-07-07',
            plannedEnd: '2026-07-14',
            soLineId: 'sol-1',
          },
        ],
      }),
    );
    expect(prisma.salesOrderLine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] create maps Prisma P2002 (planNumber race) to ConflictException', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.bom.findFirst.mockResolvedValue({ id: BOM });
    prisma.productionPlan.findFirst.mockResolvedValue(null);
    prisma.productionPlan.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── reads ───────────────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.productionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { productionPlans, count } envelope', async () => {
    prisma.productionPlan.findMany.mockResolvedValue([planRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ productionPlans: expect.any(Array), count: 1 }),
    );
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── update / updateLine ─────────────────────────────────────────────────────
  it('update throws 400 outside draft/confirmed', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord({ status: 'completed' }));
    await expect(service.update(TENANT_A, USER, 'pp-1', {} as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] the update write is tenant-scoped at the write itself', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlan.update.mockResolvedValue(planRecord());
    await service.update(TENANT_A, USER, 'pp-1', { title: 'X' } as never);
    expect(writesOf(prisma.productionPlan).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('updateLine throws 404 when the line is not in the plan/tenant', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(null);
    await expect(
      service.updateLine(TENANT_A, USER, 'pp-1', 'ln-x', { plannedQty: 5 } as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] the line write is tenant-scoped at the write itself', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(planLine());
    prisma.productionPlanLine.update.mockResolvedValue(planLine());
    await service.updateLine(TENANT_A, USER, 'pp-1', 'ln-1', { plannedQty: 5 } as never);
    expect(writesOf(prisma.productionPlanLine).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  // ── status machine (preserved) ──────────────────────────────────────────────
  it('updateStatus rejects an illegal transition (draft → completed) with 400', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord({ status: 'draft' }));
    await expect(service.updateStatus(TENANT_A, USER, 'pp-1', 'completed')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] the status write is tenant-scoped at the write itself', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord({ status: 'draft' }));
    prisma.productionPlan.update.mockResolvedValue(planRecord({ status: 'confirmed' }));
    await service.updateStatus(TENANT_A, USER, 'pp-1', 'confirmed');
    expect(writesOf(prisma.productionPlan).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── generateMos ─────────────────────────────────────────────────────────────
  const confirmedPlan = () => planRecord({ status: 'confirmed' });

  const happyMoMocks = () => {
    prisma.productionPlan.findFirst.mockResolvedValue(confirmedPlan());
    prisma.productionOrder.findFirst.mockResolvedValue(null); // MO number gen
    prisma.productionOrder.create.mockImplementation(({ data }: any) => ({
      id: MO,
      ...data,
    }));
    prisma.productionPlanLine.update.mockResolvedValue({});
    prisma.productionPlan.update.mockResolvedValue({});
  };

  it('generateMos throws 400 when the plan is draft', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord({ status: 'draft' }));
    await expect(service.generateMos(TENANT_A, USER, 'pp-1')).rejects.toThrow(BadRequestException);
  });

  it('generateMos creates one MO per eligible line, flips the line, promotes the plan', async () => {
    happyMoMocks();
    const result: any = await service.generateMos(TENANT_A, USER, 'pp-1');
    expect(result.created).toBe(1);
    const mo = prisma.productionOrder.create.mock.calls[0][0].data;
    expect(mo.tenantId).toBe(TENANT_A);
    expect(mo.planLineId).toBe('ln-1');
    expect(mo.poNumber).toBe(`MO-${new Date().getFullYear()}-0001`);
    const lineWrite = writesOf(prisma.productionPlanLine).find(
      (c) => c?.data?.status === 'mo_created',
    );
    expect(lineWrite).toBeTruthy();
    const planWrite = writesOf(prisma.productionPlan).find(
      (c) => c?.data?.status === 'in_progress',
    );
    expect(planWrite).toBeTruthy();
  });

  it('generateMos skips lines that already have a linked MO', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(
      planRecord({
        status: 'confirmed',
        lines: [planLine({ productionOrders: [{ id: MO, status: 'draft' }] })],
      }),
    );
    const result: any = await service.generateMos(TENANT_A, USER, 'pp-1');
    expect(result.created).toBe(0);
    expect(prisma.productionOrder.create).not.toHaveBeenCalled();
  });

  it('[GAP] generateMos runs inside a single $transaction', async () => {
    happyMoMocks();
    await service.generateMos(TENANT_A, USER, 'pp-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('[GAP] generateMos line/plan writes are tenant-scoped at the write itself', async () => {
    happyMoMocks();
    await service.generateMos(TENANT_A, USER, 'pp-1');
    expect(writesOf(prisma.productionPlanLine).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
    expect(writesOf(prisma.productionPlan).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('[GAP] generateMos maps Prisma P2002 (MO-number race) to ConflictException', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(confirmedPlan());
    prisma.productionOrder.findFirst.mockResolvedValue(null);
    prisma.productionOrder.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.generateMos(TENANT_A, USER, 'pp-1')).rejects.toThrow(ConflictException);
  });

  // ── linkMo ──────────────────────────────────────────────────────────────────
  it('linkMo throws 404 for unknown line or MO', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(null);
    await expect(service.linkMo(TENANT_A, USER, 'pp-1', 'ln-x', MO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] linkMo rejects an MO already linked to another plan line with 409', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(planLine());
    prisma.productionOrder.findFirst.mockResolvedValue({
      id: MO,
      poNumber: 'MO-2026-0001',
      planLineId: 'some-other-line',
    });
    await expect(service.linkMo(TENANT_A, USER, 'pp-1', 'ln-1', MO)).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] linkMo rejects a line that is already mo_created with 400', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(planLine({ status: 'mo_created' }));
    prisma.productionOrder.findFirst.mockResolvedValue({
      id: MO,
      poNumber: 'MO-2026-0001',
      planLineId: null,
    });
    await expect(service.linkMo(TENANT_A, USER, 'pp-1', 'ln-1', MO)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] linkMo writes (MO + line) are tenant-scoped at the write itself', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlanLine.findFirst.mockResolvedValue(planLine());
    prisma.productionOrder.findFirst.mockResolvedValue({
      id: MO,
      poNumber: 'MO-2026-0001',
      planLineId: null,
    });
    await service.linkMo(TENANT_A, USER, 'pp-1', 'ln-1', MO);
    expect(writesOf(prisma.productionOrder).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
    expect(writesOf(prisma.productionPlanLine).some((c) => c?.where?.tenantId === TENANT_A)).toBe(
      true,
    );
  });

  // ── actual-vs-planned (preserved) ───────────────────────────────────────────
  it('getActualVsPlanned aggregates variance, completion % and MO statuses', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(
      planRecord({
        lines: [
          planLine({
            plannedQty: 100,
            producedQty: 40,
            productionOrders: [{ id: MO, status: 'in_progress' }],
          }),
        ],
      }),
    );
    const result: any = await service.getActualVsPlanned(TENANT_A, 'pp-1');
    expect(result.summary[0].variance).toBe(-60);
    expect(result.summary[0].completionPct).toBe(40);
    expect(result.summary[0].moSummary.inProgress).toBe(1);
    expect(result.totals.totalPlanned).toBe(100);
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  it('remove throws 400 when the plan is not draft', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord({ status: 'confirmed' }));
    await expect(service.remove(TENANT_A, USER, 'pp-1')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] the soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.productionPlan.findFirst.mockResolvedValue(planRecord());
    prisma.productionPlan.update.mockResolvedValue({});
    await service.remove(TENANT_A, USER, 'pp-1');
    const write = writesOf(prisma.productionPlan).find((c) => c?.data?.deletedAt);
    expect(write.where.tenantId).toBe(TENANT_A);
  });
});
