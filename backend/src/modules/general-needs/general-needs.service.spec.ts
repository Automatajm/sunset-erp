// ============================================================================
// Unit tests for GeneralNeedsService + MrpService — spec-020-procurement-cluster
// PrismaService (and PurchaseRequisitionsService once injected) are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { GeneralNeedsService } from './general-needs.service';
import { MrpService } from './mrp.service';
import { PrismaService } from '../../database/prisma.service';
import { PurchaseRequisitionsService } from '../purchase-requisitions/purchase-requisitions.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ITEM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type ModelMock = Record<string, jest.Mock>;
const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn(),
  create: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  count: jest.fn().mockResolvedValue(0),
});

const gnRecord = (over: Record<string, unknown> = {}) => ({
  id: 'gn-1',
  tenantId: TENANT_A,
  gnNumber: 'GN-2026-0001',
  status: 'draft',
  lines: [],
  ...over,
});

const gnLine = (over: Record<string, unknown> = {}) => ({
  id: 'gnl-1',
  itemId: ITEM,
  genericDescription: 'Flour',
  quantity: 100,
  uom: 'KG',
  requiredDate: new Date('2026-07-01'),
  status: 'pending',
  ...over,
});

const buildPrisma = () => ({
  generalNeed: model(),
  generalNeedLine: model(),
  purchaseRequisition: model(),
  productionOrder: model(),
  bomComponent: model(),
  supplierItem: model(),
  item: model(),
  supplier: model(),
  uomUnit: model(),
  uomConversion: model(),
  consumptionGroup: model(),
  $transaction: jest.fn(),
});

describe('GeneralNeedsService', () => {
  let service: GeneralNeedsService;
  let prisma: ReturnType<typeof buildPrisma>;
  let prService: { generatePrNumber: jest.Mock };

  beforeEach(async () => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    );
    prService = { generatePrNumber: jest.fn().mockResolvedValue('PR-2026-0099') };
    const mod = await Test.createTestingModule({
      providers: [
        GeneralNeedsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PurchaseRequisitionsService, useValue: prService },
      ],
    }).compile();
    service = mod.get(GeneralNeedsService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]: [any]) => a),
    ...m.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  it('[GAP] findAll returns the { generalNeeds, count } envelope', async () => {
    prisma.generalNeed.findMany.mockResolvedValue([gnRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ generalNeeds: expect.any(Array), count: 1 }),
    );
  });

  it('[GAP] create maps Prisma P2002 (gnNumber race) to ConflictException', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(null);
    prisma.generalNeed.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.create(TENANT_A, USER, {
        title: 'Need',
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
        lines: [
          { genericDescription: 'F', quantity: 1, uom: 'KG', requiredDate: '2026-07-01' },
        ],
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('findOne throws 404 for another tenant; updateStatus map preserved (draft → completed → 400)', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
    prisma.generalNeed.findFirst.mockResolvedValue(gnRecord({ status: 'draft' }));
    await expect(service.updateStatus(TENANT_A, USER, 'gn-1', 'completed')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('[GAP] update / updateStatus / updateLine / remove writes are tenant-scoped', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(gnRecord());
    prisma.generalNeedLine.findFirst.mockResolvedValue(gnLine());
    await service.update(TENANT_A, USER, 'gn-1', { title: 'X' } as never);
    await service.updateStatus(TENANT_A, USER, 'gn-1', 'in_progress');
    await service.updateLine(TENANT_A, USER, 'gn-1', 'gnl-1', { quantity: 5 } as never);
    await service.remove(TENANT_A, USER, 'gn-1');
    expect(
      writesOf(prisma.generalNeed).filter((c: any) => c?.where?.tenantId === TENANT_A).length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      writesOf(prisma.generalNeedLine).some((c: any) => c?.where?.tenantId === TENANT_A),
    ).toBe(true);
  });

  // ── convertToPr ([GAP] tx + injected generator + scoped writes) ─────────────
  const happyConvertMocks = () => {
    prisma.generalNeed.findFirst.mockResolvedValue(gnRecord({ status: 'in_progress' }));
    prisma.generalNeedLine.findMany.mockResolvedValue([gnLine()]);
    prisma.generalNeedLine.count.mockResolvedValue(0);
    prisma.purchaseRequisition.findFirst.mockResolvedValue(null);
    prisma.purchaseRequisition.create.mockImplementation(({ data }: any) => ({
      id: 'pr-1',
      ...data,
      lines: [{ id: 'prl-1' }],
    }));
  };

  it('[GAP] convertToPr runs in one $transaction with the injected PR number generator', async () => {
    happyConvertMocks();
    await service.convertToPr(TENANT_A, USER, 'gn-1', ['gnl-1'], 'PR from GN');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prService.generatePrNumber).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  it('[GAP] convertToPr line + GN writes are tenant-scoped; PR carries tenantId + sourceRefId', async () => {
    happyConvertMocks();
    await service.convertToPr(TENANT_A, USER, 'gn-1', ['gnl-1'], 'PR from GN');
    expect(
      writesOf(prisma.generalNeedLine).some((c: any) => c?.where?.tenantId === TENANT_A),
    ).toBe(true);
    const pr = prisma.purchaseRequisition.create.mock.calls[0][0].data;
    expect(pr.tenantId).toBe(TENANT_A);
    expect(pr.sourceRefId).toBe('gn-1');
  });

  // ── explodeFromMos ([GAP] item-filtered preferred supplier) ─────────────────
  it('[GAP] explodeFromMos resolves the preferred supplier via the component group item (not tenant-wide)', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(gnRecord({ status: 'draft' }));
    prisma.productionOrder.findMany.mockResolvedValue([
      { id: MO, bomId: 'bom-1', quantityToProduce: 10, poNumber: 'MO-2026-0001', plannedStartDate: new Date() },
    ]);
    prisma.bomComponent.findMany.mockResolvedValue([
      {
        id: 'bc-1',
        consumptionGroupId: 'cg-1',
        quantityPer: 2,
        uom: 'KG',
        consumptionGroup: { id: 'cg-1', code: 'FLOUR', name: 'Flour', consumptionUomId: null },
      },
    ]);
    prisma.item.findFirst.mockResolvedValue({ id: ITEM }); // purchasable item of the group
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    prisma.generalNeedLine.findFirst.mockResolvedValue(null);
    prisma.generalNeedLine.create.mockResolvedValue({});
    await service.explodeFromMos(TENANT_A, USER, 'gn-1', [MO]).catch(() => {});
    const calls = prisma.supplierItem.findFirst.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // the lookup must be narrowed to the group's purchasable item, not tenant-wide
    expect(JSON.stringify(calls[0][0].where)).toContain(ITEM);
    // and the component read itself must be tenant-scoped
    expect(
      prisma.bomComponent.findMany.mock.calls.some(([a]: [any]) => a?.where?.tenantId === TENANT_A),
    ).toBe(true);
  });
});

describe('MrpService', () => {
  let service: MrpService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    );
    const mod = await Test.createTestingModule({
      providers: [MrpService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(MrpService);
  });

  it('runMrp throws 404 when the GN is not in the tenant', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(null);
    await expect(service.runMrp(TENANT_B, USER, 'gn-1', [MO])).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] runMrp bomComponent reads include tenantId; GN write is tenant-scoped; runs in a $transaction', async () => {
    prisma.generalNeed.findFirst.mockResolvedValue(
      gnRecord({ status: 'draft', periodEnd: new Date('2026-07-31') }),
    );
    prisma.productionOrder.findMany.mockResolvedValue([
      {
        id: MO,
        bomId: 'bom-1',
        quantityToProduce: 10,
        poNumber: 'MO-2026-0001',
        plannedStartDate: new Date('2026-07-01'),
        item: { id: 'fg', code: 'FG', name: 'Burger' },
      },
    ]);
    prisma.bomComponent.findMany.mockResolvedValue([
      {
        id: 'bc-1',
        lineNumber: 1,
        consumptionGroupId: 'cg-1',
        quantityPer: 2,
        uom: 'KG',
        consumptionGroup: {
          id: 'cg-1',
          code: 'FLOUR',
          name: 'Flour',
          consumptionUomId: 'uom-kg',
          consumptionUom: { id: 'uom-kg', code: 'KG', name: 'Kilogram', type: 'mass' },
        },
        consumptionUom: null,
      },
    ]);
    prisma.item.findFirst.mockResolvedValue(null);
    prisma.generalNeedLine.findFirst.mockResolvedValue(null);
    await service.runMrp(TENANT_A, USER, 'gn-1', [MO]);
    expect(
      prisma.bomComponent.findMany.mock.calls.some(
        ([a]: [any]) => a?.where?.tenantId === TENANT_A,
      ),
    ).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    const gnWrites = [
      ...prisma.generalNeed.update.mock.calls.map(([a]: [any]) => a),
      ...prisma.generalNeed.updateMany.mock.calls.map(([a]: [any]) => a),
    ];
    expect(gnWrites.some((c: any) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });
});
