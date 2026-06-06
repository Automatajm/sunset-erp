// ============================================================================
// Unit tests for ProductionOrdersService — spec-024-production-orders
// PrismaService and AutomationService are mocked; these assert behavior, not
// the DB. Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion
// and are expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const BOM = '44444444-4444-4444-4444-444444444444';
const ITEM = '55555555-5555-5555-5555-555555555555';
const MO_ID = '66666666-6666-6666-6666-666666666666';
const VAR_ID = '77777777-7777-7777-7777-777777777777';

const YEAR = new Date().getFullYear();
const YYYYMM = `${YEAR}${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;

type ModelMock = Record<string, jest.Mock>;

describe('ProductionOrdersService', () => {
  let service: ProductionOrdersService;
  let prisma: Record<string, any>;
  let automation: { handleAutoJe: jest.Mock };

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
      productionOrder: model(),
      bom: model(),
      workCenter: model(),
      moLaborActual: model(),
      moMaterialActual: model(),
      productionVariance: model(),
      item: model(),
      account: model(),
      journalEntry: model(),
    };
    automation = { handleAutoJe: jest.fn().mockResolvedValue({ je: { id: 'je-1' } }) };

    const mod = await Test.createTestingModule({
      providers: [
        ProductionOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AutomationService, useValue: automation },
      ],
    }).compile();
    service = mod.get(ProductionOrdersService);
  });

  const bomRow = () => ({
    id: BOM,
    parentItemId: ITEM,
    parentItem: { id: ITEM, code: 'FG-1', name: 'Burger' },
    components: [],
  });

  const setupCreateMocks = () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.productionOrder.findFirst.mockResolvedValue(null); // number gen (legacy)
    prisma.productionOrder.findMany.mockResolvedValue([]); // number gen (numeric-max)
    prisma.productionOrder.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: MO_ID, quantityProduced: 0, ...data }),
    );
  };

  const moRow = (over: Record<string, any> = {}): any => ({
    id: MO_ID,
    poNumber: `MO-${YEAR}-0001`,
    status: 'draft',
    bomId: BOM,
    quantityToProduce: 100,
    quantityProduced: 0,
    actualStartDate: null,
    actualEndDate: null,
    ...over,
  });

  // ── Reads: tenant scoping ──────────────────────────────────────────────────

  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.productionOrder.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findOne throws NotFoundException when the MO is in another tenant', async () => {
    prisma.productionOrder.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, MO_ID)).rejects.toThrow(NotFoundException);
  });

  it('[GAP] findOne scopes the BOM lookup by tenantId + deletedAt: null', async () => {
    prisma.productionOrder.findFirst.mockResolvedValue(moRow());
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    await service.findOne(TENANT_A, MO_ID);
    expect(prisma.bom.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Response format ────────────────────────────────────────────────────────

  it('[GAP] findAll returns the { productionOrders, count } envelope', async () => {
    prisma.productionOrder.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A);
    expect(res).toHaveProperty('productionOrders');
    expect(res).toHaveProperty('count');
  });

  it('[GAP] getAllVariances returns the { variances, count } envelope', async () => {
    prisma.productionVariance.findMany.mockResolvedValue([]);
    const res: any = await service.getAllVariances(TENANT_A, {});
    expect(res).toHaveProperty('variances');
    expect(res).toHaveProperty('count');
  });

  // ── Create ─────────────────────────────────────────────────────────────────

  it('create throws NotFoundException when the BOM is missing/other-tenant', async () => {
    setupCreateMocks();
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.create(TENANT_A, USER, { bomId: BOM, quantityOrdered: 100 } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('create derives itemId from the BOM parent and starts as draft', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, { bomId: BOM, quantityOrdered: 100 } as any);
    expect(prisma.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, itemId: ITEM, status: 'draft' }),
      }),
    );
  });

  it('[GAP] create persists priority', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, {
      bomId: BOM,
      quantityOrdered: 100,
      priority: 'high',
    } as any);
    expect(prisma.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 'high' }) }),
    );
  });

  it('[GAP] poNumber comes from the NUMERIC max, spanning soft-deleted rows', async () => {
    setupCreateMocks();
    // String sort would pick "999"; numeric max must pick 1000 → next is 1001.
    prisma.productionOrder.findMany.mockResolvedValue([
      { poNumber: `MO-${YEAR}-999` },
      { poNumber: `MO-${YEAR}-1000` },
    ]);
    await service.create(TENANT_A, USER, { bomId: BOM, quantityOrdered: 100 } as any);
    expect(prisma.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ poNumber: `MO-${YEAR}-1001` }),
      }),
    );
  });

  it('[GAP] a poNumber P2002 collision maps to 409 ConflictException', async () => {
    setupCreateMocks();
    prisma.productionOrder.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.create(TENANT_A, USER, { bomId: BOM, quantityOrdered: 100 } as any),
    ).rejects.toThrow(ConflictException);
  });

  // ── Update / Remove (draft only) ───────────────────────────────────────────

  it('update throws BadRequestException when the MO is not draft', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'released' }));
    await expect(
      service.update(TENANT_A, USER, MO_ID, { quantityOrdered: 150 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] update writes via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow());
    prisma.productionOrder.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, MO_ID, { quantityOrdered: 150 } as any);
    expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MO_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('remove throws BadRequestException when the MO is not draft', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'in_progress' }));
    await expect(service.remove(TENANT_A, USER, MO_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] remove soft-deletes via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow());
    prisma.productionOrder.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, MO_ID);
    expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MO_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: USER }),
      }),
    );
  });

  // ── State machine ──────────────────────────────────────────────────────────

  it('[GAP] updateStatus rejects a status outside the whitelist', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow());
    await expect(service.updateStatus(TENANT_A, USER, MO_ID, 'garbage')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] updateStatus rejects an invalid transition (draft → completed)', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'draft' }));
    await expect(service.updateStatus(TENANT_A, USER, MO_ID, 'completed')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] updateStatus rejects transitions out of a terminal status (cancelled → released)', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'cancelled' }));
    await expect(service.updateStatus(TENANT_A, USER, MO_ID, 'released')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] a valid transition (draft → released) writes via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'draft' }));
    prisma.productionOrder.updateMany.mockResolvedValue({ count: 1 });
    await service.updateStatus(TENANT_A, USER, MO_ID, 'released');
    expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MO_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ status: 'released' }),
      }),
    );
  });

  // ── Labor actuals ──────────────────────────────────────────────────────────

  it('addLaborActual is blocked for a draft MO', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'draft' }));
    await expect(
      service.addLaborActual(TENANT_A, USER, MO_ID, { hoursActual: 8 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('addLaborActual computes laborCost = rate × hours and scopes the create', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'in_progress' }));
    prisma.moLaborActual.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'la-1', ...data }),
    );
    await service.addLaborActual(TENANT_A, USER, MO_ID, {
      hoursActual: 9.5,
      laborRate: 15,
    } as any);
    const data = prisma.moLaborActual.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(TENANT_A);
    expect(Number(data.laborCost)).toBeCloseTo(142.5);
  });

  it('getLaborActuals returns the efficiency summary', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow());
    prisma.moLaborActual.findMany.mockResolvedValue([
      { hoursPlanned: 8, hoursActual: 10, laborCost: 150 },
    ]);
    const res: any = await service.getLaborActuals(TENANT_A, MO_ID);
    expect(res.summary.varianceHours).toBe(2);
    expect(res.summary.efficiency).toBeCloseTo(80);
  });

  // ── Material actuals ───────────────────────────────────────────────────────

  it('addMaterialActual throws NotFoundException for a missing/other-tenant item', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'in_progress' }));
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(
      service.addMaterialActual(TENANT_A, USER, MO_ID, {
        itemId: ITEM,
        qtyPlanned: 100,
        qtyActual: 108,
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('addMaterialActual computes varianceCost = (actual − planned) × unitCost', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status: 'in_progress' }));
    prisma.item.findFirst.mockResolvedValue({ id: ITEM });
    prisma.moMaterialActual.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'ma-1', item: {}, ...data }),
    );
    await service.addMaterialActual(TENANT_A, USER, MO_ID, {
      itemId: ITEM,
      qtyPlanned: 100,
      qtyActual: 108,
      unitCost: 2.5,
    } as any);
    const data = prisma.moMaterialActual.create.mock.calls[0][0].data;
    expect(Number(data.varianceCost)).toBeCloseTo(20);
  });

  // ── FG delivery ────────────────────────────────────────────────────────────

  const setupDeliverMocks = (status = 'in_progress') => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow({ status }));
    prisma.productionOrder.update.mockResolvedValue({});
    prisma.productionOrder.updateMany.mockResolvedValue({ count: 1 });
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.productionVariance.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: VAR_ID, ...data }),
    );
  };

  it('[GAP] deliver is blocked for a completed MO (no re-delivery / duplicate JE)', async () => {
    setupDeliverMocks('completed');
    await expect(
      service.deliverFinishedGoods(TENANT_A, USER, MO_ID, {
        quantityDelivered: 95,
        unitCost: 25,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('deliver creates a merma variance when under-delivered', async () => {
    setupDeliverMocks();
    const res: any = await service.deliverFinishedGoods(TENANT_A, USER, MO_ID, {
      quantityDelivered: 95,
      unitCost: 25,
    } as any);
    expect(prisma.productionVariance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: TENANT_A, varianceType: 'merma' }),
      }),
    );
    expect(res.variancesCreated).toBe(1);
  });

  it('deliver posts the FG auto-JE through AutomationService when unitCost > 0', async () => {
    setupDeliverMocks();
    await service.deliverFinishedGoods(TENANT_A, USER, MO_ID, {
      quantityDelivered: 100,
      unitCost: 25,
    } as any);
    expect(automation.handleAutoJe).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, module: 'fg_delivery' }),
    );
  });

  it('[GAP] the FG JE entryNumber comes from the NUMERIC max', async () => {
    setupDeliverMocks();
    prisma.journalEntry.findMany.mockResolvedValue([
      { entryNumber: `JE-${YYYYMM}-999` },
      { entryNumber: `JE-${YYYYMM}-1000` },
    ]);
    await service.deliverFinishedGoods(TENANT_A, USER, MO_ID, {
      quantityDelivered: 100,
      unitCost: 25,
    } as any);
    expect(automation.handleAutoJe).toHaveBeenCalledWith(
      expect.objectContaining({
        jeData: expect.objectContaining({ entryNumber: `JE-${YYYYMM}-1001` }),
      }),
    );
  });

  it('[GAP] deliver writes the MO via tenant-scoped updateMany', async () => {
    setupDeliverMocks();
    await service.deliverFinishedGoods(TENANT_A, USER, MO_ID, {
      quantityDelivered: 100,
      unitCost: 25,
    } as any);
    expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: MO_ID, tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Variances ──────────────────────────────────────────────────────────────

  const varianceRow = (over: Record<string, any> = {}): any => ({
    id: VAR_ID,
    varianceType: 'merma',
    status: 'open',
    totalCost: 1250,
    description: 'loss',
    productionOrder: { id: MO_ID, poNumber: `MO-${YEAR}-0001` },
    ...over,
  });

  it('postVarianceJe throws BadRequestException when already posted', async () => {
    prisma.productionVariance.findFirst.mockResolvedValue(varianceRow({ status: 'je_posted' }));
    await expect(service.postVarianceJe(TENANT_A, USER, VAR_ID, {} as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('postVarianceJe throws BadRequestException for a zero-cost variance', async () => {
    prisma.productionVariance.findFirst.mockResolvedValue(varianceRow({ totalCost: 0 }));
    await expect(service.postVarianceJe(TENANT_A, USER, VAR_ID, {} as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] account-override lookups include deletedAt: null', async () => {
    prisma.productionVariance.findFirst.mockResolvedValue(varianceRow());
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.productionVariance.update.mockResolvedValue({});
    prisma.productionVariance.updateMany.mockResolvedValue({ count: 1 });
    await service.postVarianceJe(TENANT_A, USER, VAR_ID, {
      debitAccountId: 'acct-override',
    } as any);
    for (const call of prisma.account.findFirst.mock.calls) {
      expect(call[0].where).toEqual(expect.objectContaining({ deletedAt: null }));
    }
  });

  it('[GAP] postVarianceJe updates the variance via tenant-scoped updateMany', async () => {
    prisma.productionVariance.findFirst.mockResolvedValue(varianceRow());
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.productionVariance.updateMany.mockResolvedValue({ count: 1 });
    await service.postVarianceJe(TENANT_A, USER, VAR_ID, {} as any);
    expect(prisma.productionVariance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: VAR_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ status: 'je_posted' }),
      }),
    );
  });

  it('getVariances returns the merma/surplus summary', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(moRow());
    prisma.productionVariance.findMany.mockResolvedValue([
      varianceRow(),
      varianceRow({ varianceType: 'surplus', totalCost: 200, status: 'je_posted' }),
    ]);
    const res: any = await service.getVariances(TENANT_A, MO_ID);
    expect(res.summary.totalMermaCost).toBe(1250);
    expect(res.summary.totalSurplusCost).toBe(200);
    expect(res.summary.netVarianceCost).toBe(1050);
  });
});
