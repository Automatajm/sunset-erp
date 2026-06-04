// ============================================================================
// Unit tests for BomService — spec-011-bom
// PrismaService (and Items/ConsumptionGroups/WorkCenters services) are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { BomService } from './bom.service';
import { ItemsService } from '../items/items.service';
import { ConsumptionGroupsService } from '../consumption-groups/consumption-groups.service';
import { WorkCentersService } from '../work-centers/work-centers.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ITEM_ID = '44444444-4444-4444-4444-444444444444';
const CG_ID = '55555555-5555-5555-5555-555555555555';
const UOM_ID = '66666666-6666-6666-6666-666666666666';
const WC_ID = '77777777-7777-7777-7777-777777777777';

// A BOM row formatBomResponse can always digest.
const bomRow = (extra: Record<string, unknown> = {}) => ({
  id: 'bom-1',
  bomNumber: 'BOM-2026-0001',
  version: 1,
  parentItem: { id: ITEM_ID, code: 'FG-1', name: 'Burger' },
  components: [],
  routings: [],
  _count: { productionPlanLines: 0 },
  ...extra,
});

const componentRow = (extra: Record<string, unknown> = {}) => ({
  quantityPer: '2',
  scrapPercent: '10',
  uom: 'KG',
  consumptionGroup: { id: CG_ID, code: 'CG-2026-0001', name: 'Beef' },
  consumptionUom: null,
  ...extra,
});

describe('BomService', () => {
  let service: BomService;
  let prisma: {
    bom: Record<string, jest.Mock>;
    bomRouting: Record<string, jest.Mock>;
    consumptionGroup: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    workCenter: Record<string, jest.Mock>;
  };
  let itemsService: { findOne: jest.Mock };
  let cgService: { findOne: jest.Mock };
  let wcService: { findOne: jest.Mock };

  beforeEach(async () => {
    prisma = {
      bom: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      bomRouting: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      consumptionGroup: { findFirst: jest.fn() },
      item: { findFirst: jest.fn() },
      workCenter: { findFirst: jest.fn() },
    };
    // Defaults: every foreign lookup resolves (both the current direct-Prisma path
    // and the target injected-service path).
    prisma.item.findFirst.mockResolvedValue({ id: ITEM_ID });
    prisma.consumptionGroup.findFirst.mockResolvedValue({
      id: CG_ID,
      consumptionUomId: UOM_ID,
      consumptionUom: { id: UOM_ID, code: 'g' },
    });
    prisma.workCenter.findFirst.mockResolvedValue({ id: WC_ID });
    itemsService = { findOne: jest.fn().mockResolvedValue({ id: ITEM_ID }) };
    cgService = {
      findOne: jest.fn().mockResolvedValue({
        id: CG_ID,
        consumptionUomId: UOM_ID,
        items: [],
        totalConsumptionQty: 0,
      }),
    };
    wcService = { findOne: jest.fn().mockResolvedValue({ id: WC_ID }) };

    const mod = await Test.createTestingModule({
      providers: [
        BomService,
        { provide: PrismaService, useValue: prisma },
        { provide: ItemsService, useValue: itemsService },
        { provide: ConsumptionGroupsService, useValue: cgService },
        { provide: WorkCentersService, useValue: wcService },
      ],
    }).compile();
    service = mod.get(BomService);
  });

  const validCreate = () =>
    ({
      itemId: ITEM_ID,
      components: [{ consumptionGroupId: CG_ID, quantity: 0.15, uom: 'KG', scrapPercent: 3 }],
    }) as any;

  // ── Create ────────────────────────────────────────────────────────────────
  it('[GAP] create validates the parent item via the injected ItemsService (404, no direct prisma.item)', async () => {
    itemsService.findOne.mockRejectedValue(new NotFoundException('Item not found'));
    prisma.item.findFirst.mockResolvedValue(null); // current path agrees
    await expect(service.create(TENANT_A, USER, validCreate())).rejects.toThrow(NotFoundException);
    expect(prisma.bom.create).not.toHaveBeenCalled();
    expect(itemsService.findOne).toHaveBeenCalledWith(TENANT_A, ITEM_ID);
  });

  it('[GAP] create validates every consumption group via the injected ConsumptionGroupsService', async () => {
    cgService.findOne.mockRejectedValue(new NotFoundException('ConsumptionGroup not found'));
    prisma.consumptionGroup.findFirst.mockResolvedValue(null); // current path agrees
    await expect(service.create(TENANT_A, USER, validCreate())).rejects.toThrow(NotFoundException);
    expect(prisma.bom.create).not.toHaveBeenCalled();
  });

  it('create throws ConflictException on a duplicate active bomNumber (tenant-scoped)', async () => {
    prisma.bom.findMany.mockResolvedValue([]);
    prisma.bom.findFirst.mockResolvedValue({ id: 'dup', bomNumber: 'BOM-X' });
    await expect(
      service.create(TENANT_A, USER, { ...validCreate(), bomCode: 'BOM-X' }),
    ).rejects.toThrow(ConflictException);
  });

  it('create writes tenantId + audit on the BOM and its components, auto-filling consumptionUomId', async () => {
    prisma.bom.findMany.mockResolvedValue([]);
    prisma.bom.findFirst.mockResolvedValue(null);
    prisma.bom.create.mockResolvedValue(bomRow());
    await service.create(TENANT_A, USER, validCreate());
    const [arg] = prisma.bom.create.mock.calls[0];
    expect(arg.data).toEqual(
      expect.objectContaining({ tenantId: TENANT_A, createdBy: USER, updatedBy: USER }),
    );
    const comp = arg.data.components.create[0];
    expect(comp.tenantId).toBe(TENANT_A);
    expect(comp.lineNumber).toBe(1);
    expect(comp.consumptionUomId).toBe(UOM_ID); // auto-filled from the group
  });

  it('[GAP] generateBomNumber computes the NUMERIC max (not lexicographic) with a NaN guard', async () => {
    const year = new Date().getFullYear();
    // 'BOM-YYYY-99' sorts above 'BOM-YYYY-104' lexicographically — numeric max must win.
    prisma.bom.findMany.mockResolvedValue([
      { bomNumber: `BOM-${year}-99` },
      { bomNumber: `BOM-${year}-104` },
      { bomNumber: `BOM-${year}-garbage` },
    ]);
    prisma.bom.findFirst.mockResolvedValue(null); // dup check + current-codegen path
    prisma.bom.create.mockResolvedValue(bomRow());
    await service.create(TENANT_A, USER, validCreate());
    const [arg] = prisma.bom.create.mock.calls[0];
    expect(arg.data.bomNumber).toBe(`BOM-${year}-0105`);
  });

  // ── Find ──────────────────────────────────────────────────────────────────
  it('findAll scopes to tenantId + deletedAt: null and applies the itemId filter', async () => {
    prisma.bom.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, ITEM_ID);
    expect(prisma.bom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          deletedAt: null,
          parentItemId: ITEM_ID,
        }),
      }),
    );
  });

  it('[GAP] findAll returns { boms, count } envelope (spec §Endpoints)', async () => {
    prisma.bom.findMany.mockResolvedValue([bomRow(), bomRow({ id: 'bom-2' })]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ boms: expect.any(Array), count: 2 }));
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] findOne excludes soft-deleted components (include filters deletedAt: null)', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    await service.findOne(TENANT_A, 'bom-1');
    const [arg] = prisma.bom.findFirst.mock.calls[0];
    // The routings include already filters; the components include must too (MRP fix).
    expect(arg.include.components.where).toEqual(expect.objectContaining({ deletedAt: null }));
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the BOM is in another tenant', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update throws ConflictException when the new bomCode belongs to another row', async () => {
    prisma.bom.findFirst
      .mockResolvedValueOnce(bomRow()) // findOne guard
      .mockResolvedValueOnce({ id: 'other', bomNumber: 'TAKEN' }); // conflict
    await expect(service.update(TENANT_A, USER, 'id', { bomCode: 'TAKEN' } as any)).rejects.toThrow(
      ConflictException,
    );
  });

  it('[GAP] update writes are tenant-scoped at the write itself (currently where:{id})', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bom.update.mockResolvedValue(bomRow());
    prisma.bom.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { isActive: false } as any);
    const scoped =
      prisma.bom.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.bom.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });

  it('[GAP] update validates itemId re-parenting via ItemsService (cross-tenant vector)', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bom.update.mockResolvedValue(bomRow());
    prisma.bom.updateMany.mockResolvedValue({ count: 1 });
    itemsService.findOne.mockRejectedValue(new NotFoundException('Item not found'));
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(
      service.update(TENANT_A, USER, 'id', { itemId: 'other-tenant-item' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('[GAP] remove is blocked while production plan lines reference the BOM', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow({ _count: { productionPlanLines: 2 } }));
    prisma.bom.update.mockResolvedValue(bomRow());
    prisma.bom.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'id')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bom.update.mockResolvedValue(bomRow());
    prisma.bom.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scoped =
      prisma.bom.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.bom.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });

  // ── Calculations ──────────────────────────────────────────────────────────
  it('calculateMaterialRequirements: required = qtyPer × qty; scrap = required × pct/100', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow({ components: [componentRow()] }));
    const result = await service.calculateMaterialRequirements(TENANT_A, 'bom-1', 100);
    const req = result.requirements[0];
    expect(req.requiredQuantity).toBe(200); // 2 × 100
    expect(req.scrapQuantity).toBe(20); // 200 × 10%
    expect(req.totalQuantity).toBe(220);
    expect(result.totalComponents).toBe(1);
  });

  it('getLaborEstimate totals setup + run × qty and costs at the work-center rate', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findMany.mockResolvedValue([
      {
        stepNumber: 10,
        description: 'Grill',
        setupTime: '0.5',
        runTimePerUnit: '0.004',
        workCenter: { id: WC_ID, code: 'WC', name: 'Grill', costPerHour: '350' },
      },
    ]);
    const result = await service.getLaborEstimate(TENANT_A, 'bom-1', 1000);
    expect(result.totalSetupHours).toBe(0.5);
    expect(result.totalRunHours).toBe(4);
    expect(result.totalLaborHours).toBe(4.5);
    expect(result.estimatedLaborCost).toBe(4.5 * 350);
  });

  // ── Routing steps ─────────────────────────────────────────────────────────
  it('[GAP] addRoutingStep validates the work center via the injected WorkCentersService', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    wcService.findOne.mockRejectedValue(new NotFoundException('Work center not found'));
    prisma.workCenter.findFirst.mockResolvedValue(null);
    await expect(
      service.addRoutingStep(TENANT_A, USER, 'bom-1', {
        stepNumber: 10,
        workCenterId: WC_ID,
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.bomRouting.create).not.toHaveBeenCalled();
  });

  it('addRoutingStep throws ConflictException on a duplicate step number', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findFirst.mockResolvedValue({ id: 'dup', stepNumber: 10 });
    await expect(
      service.addRoutingStep(TENANT_A, USER, 'bom-1', {
        stepNumber: 10,
        workCenterId: WC_ID,
      } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('[GAP] the step-number dup-check is tenant-scoped (currently bomId only)', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findFirst.mockResolvedValue(null);
    prisma.bomRouting.create.mockResolvedValue({
      stepNumber: 10,
      setupTime: '0',
      runTimePerUnit: '0',
      workCenter: { id: WC_ID },
    });
    await service.addRoutingStep(TENANT_A, USER, 'bom-1', {
      stepNumber: 10,
      workCenterId: WC_ID,
    } as any);
    const dupCheck = prisma.bomRouting.findFirst.mock.calls.find(
      ([a]) => a?.where?.stepNumber === 10,
    );
    expect(dupCheck[0].where.tenantId).toBe(TENANT_A);
  });

  it('updateRoutingStep 404s for a step missing in the tenant/BOM', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findFirst.mockResolvedValue(null);
    await expect(
      service.updateRoutingStep(TENANT_A, USER, 'bom-1', 'step-x', {} as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('[GAP] updateRoutingStep write is tenant-scoped at the write itself', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findFirst.mockResolvedValue({ id: 'step-1', stepNumber: 10 });
    prisma.bomRouting.update.mockResolvedValue({
      id: 'step-1',
      setupTime: '0',
      runTimePerUnit: '0',
      workCenter: { id: WC_ID },
    });
    prisma.bomRouting.updateMany.mockResolvedValue({ count: 1 });
    await service.updateRoutingStep(TENANT_A, USER, 'bom-1', 'step-1', {
      description: 'X',
    } as any);
    const scoped =
      prisma.bomRouting.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.bomRouting.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });

  it('[GAP] removeRoutingStep soft-delete write is tenant-scoped at the write itself', async () => {
    prisma.bom.findFirst.mockResolvedValue(bomRow());
    prisma.bomRouting.findFirst.mockResolvedValue({ id: 'step-1' });
    prisma.bomRouting.update.mockResolvedValue({ id: 'step-1' });
    prisma.bomRouting.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.removeRoutingStep(TENANT_A, USER, 'bom-1', 'step-1');
    expect(result).toEqual(expect.objectContaining({ id: 'step-1' }));
    const scoped =
      prisma.bomRouting.updateMany.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A) ||
      prisma.bomRouting.update.mock.calls.some(([a]) => a?.where?.tenantId === TENANT_A);
    expect(scoped).toBe(true);
  });
});
