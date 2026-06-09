// ============================================================================
// Unit tests for SupplierItemsService — spec-018-supplier-items
// PrismaService and UomService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { SupplierItemsService } from './supplier-items.service';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ITEM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SUP = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const UOM_GAL = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const UOM_LT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

type ModelMock = Record<string, jest.Mock>;

const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  groupBy: jest.fn().mockResolvedValue([]),
});

const itemRecord = (over: Record<string, unknown> = {}) => ({
  code: 'ITM-1',
  name: 'Adhesive',
  purchaseUomId: UOM_GAL,
  purchaseUom: { code: 'GAL', name: 'Gallon' },
  ...over,
});

// Fat enough for enrich(): purchaseUom.code, conversionFactor, item.baseUom.
const siRecord = (over: Record<string, unknown> = {}) => ({
  id: 'si-1',
  tenantId: TENANT_A,
  itemId: ITEM,
  supplierId: SUP,
  conversionFactor: 1,
  isPreferred: false,
  deletedAt: null,
  supplierItemCode: null,
  supplierItemName: null,
  packSize: 1,
  lastPrice: null,
  leadTimeDays: 0,
  moq: 1,
  notes: null,
  purchaseUom: { code: 'GAL' },
  item: { baseUom: 'PCS' },
  supplier: { code: 'SUP-2026-0001' },
  ...over,
});

const createDto = (over: Record<string, unknown> = {}) =>
  ({ supplierId: SUP, itemId: ITEM, purchaseUomId: UOM_GAL, ...over }) as never;

describe('SupplierItemsService', () => {
  let service: SupplierItemsService;
  let prisma: {
    supplierItem: ModelMock;
    item: ModelMock;
    supplier: ModelMock;
    uomUnit: ModelMock;
    supplierItemPriceHistory: ModelMock;
    rfq: ModelMock;
  };

  beforeEach(async () => {
    prisma = {
      supplierItem: model(),
      item: model(),
      supplier: model(),
      uomUnit: model(),
      supplierItemPriceHistory: model(),
      rfq: model(),
    };
    const uom = { calcAllQties: jest.fn(), calcNewWAC: jest.fn(), calcFinancialValue: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        SupplierItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UomService, useValue: uom },
      ],
    }).compile();
    service = mod.get(SupplierItemsService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]) => a),
    ...m.updateMany.mock.calls.map(([a]) => a),
  ];

  // Happy-path mocks all create tests can build on.
  const happyCreateMocks = () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord());
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    prisma.supplierItem.create.mockImplementation(({ data }) => siRecord(data));
    prisma.item.update.mockResolvedValue({});
  };

  // ── create — UOM rule (preserved) ───────────────────────────────────────────
  it('create throws 404 when the item is not in the tenant', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  it('[GAP] the UOM-rule item read includes deletedAt: null', async () => {
    happyCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('create throws 400 when the item has no purchase UOM configured', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord({ purchaseUomId: null }));
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(BadRequestException);
  });

  it('create throws 400 on a purchase-UOM mismatch, naming both codes', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord());
    prisma.uomUnit.findFirst.mockResolvedValue({ code: 'LT', name: 'Liter' });
    await expect(
      service.create(TENANT_A, USER, createDto({ purchaseUomId: UOM_LT })),
    ).rejects.toThrow(BadRequestException);
  });

  // ── create — supplier validation ([GAP]) ────────────────────────────────────
  it('[GAP] create throws 404 when the supplier is not an in-tenant, non-deleted supplier', async () => {
    happyCreateMocks();
    prisma.supplier.findFirst.mockResolvedValue(null); // foreign or bogus supplier
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(NotFoundException);
  });

  // ── create — duplicates & reactivation ──────────────────────────────────────
  it('create throws 409 when an active entry already exists', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord());
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord({ deletedAt: null }));
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  it('create reactivates a soft-deleted entry in place, merging provided fields', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord());
    prisma.supplierItem.findFirst.mockResolvedValue(
      siRecord({ deletedAt: new Date(), lastPrice: 10 }),
    );
    prisma.supplierItem.update.mockResolvedValue(siRecord());
    prisma.supplierItem.updateMany.mockResolvedValue({ count: 1 });
    const result: any = await service.create(TENANT_A, USER, createDto({ lastPrice: 20 }));
    const write = writesOf(prisma.supplierItem).find((c) => c?.data?.deletedAt === null);
    expect(write).toBeTruthy(); // reactivated
    expect(write.data.lastPrice).toBe(20); // dto value wins
    expect(result.conversionPreview).toContain('GAL');
    expect(prisma.supplierItem.create).not.toHaveBeenCalled();
  });

  it('[GAP] the reactivation write is tenant-scoped at the write itself', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.item.findFirst.mockResolvedValue(itemRecord());
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord({ deletedAt: new Date() }));
    prisma.supplierItem.update.mockResolvedValue(siRecord());
    await service.create(TENANT_A, USER, createDto());
    expect(writesOf(prisma.supplierItem).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('[GAP] create maps Prisma P2002 (unique race) to ConflictException', async () => {
    happyCreateMocks();
    prisma.supplierItem.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── preferred-supplier management ───────────────────────────────────────────
  it('create with isPreferred clears competitors (tenant-scoped) and mirrors defaultSupplierId', async () => {
    happyCreateMocks();
    await service.create(TENANT_A, USER, createDto({ isPreferred: true }));
    expect(prisma.supplierItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, itemId: ITEM, isPreferred: true }),
        data: { isPreferred: false },
      }),
    );
    const itemWrite = writesOf(prisma.item).find((c) => c?.data?.defaultSupplierId === SUP);
    expect(itemWrite).toBeTruthy();
  });

  it('[GAP] the Item.defaultSupplierId mirror write is tenant-scoped', async () => {
    happyCreateMocks();
    await service.create(TENANT_A, USER, createDto({ isPreferred: true }));
    expect(writesOf(prisma.item).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── reads ───────────────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.supplierItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { supplierItems, count } envelope', async () => {
    prisma.supplierItem.findMany.mockResolvedValue([siRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ supplierItems: expect.any(Array), count: 1 }));
    expect(result.supplierItems[0].conversionPreview).toContain('GAL');
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── update ──────────────────────────────────────────────────────────────────
  it('update re-validates the UOM rule when purchaseUomId changes', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.item.findFirst.mockResolvedValue(itemRecord()); // item uses GAL
    prisma.uomUnit.findFirst.mockResolvedValue({ code: 'LT', name: 'Liter' });
    await expect(
      service.update(TENANT_A, USER, 'si-1', { purchaseUomId: UOM_LT } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] the update write is tenant-scoped at the write itself', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.supplierItem.update.mockResolvedValue(siRecord());
    await service.update(TENANT_A, USER, 'si-1', { lastPrice: 5 } as never);
    expect(writesOf(prisma.supplierItem).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  it('remove soft-deletes and returns { message, id }', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.supplierItem.update.mockResolvedValue({});
    const result = await service.remove(TENANT_A, USER, 'si-1');
    const write = writesOf(prisma.supplierItem).find((c) => c?.data?.deletedAt);
    expect(write.data.deletedAt).toEqual(expect.any(Date));
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'si-1' }));
  });

  it('[GAP] the remove write is tenant-scoped at the write itself', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.supplierItem.update.mockResolvedValue({});
    await service.remove(TENANT_A, USER, 'si-1');
    expect(writesOf(prisma.supplierItem).some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('[GAP] removing the preferred entry clears Item.defaultSupplierId', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord({ isPreferred: true }));
    prisma.supplierItem.update.mockResolvedValue({});
    prisma.item.update.mockResolvedValue({});
    await service.remove(TENANT_A, USER, 'si-1');
    const itemWrite = writesOf(prisma.item).find((c) => c?.data?.defaultSupplierId === null);
    expect(itemWrite).toBeTruthy();
  });

  // ── enrich: price-expiry state ──────────────────────────────────────────────
  it('enrich classifies a priced row inside the alert window as "warning"', async () => {
    const in20Days = new Date();
    in20Days.setDate(in20Days.getDate() + 20);
    prisma.supplierItem.findMany.mockResolvedValue([
      siRecord({ lastPrice: 10, priceValidUntil: in20Days, priceAlertDays: 30 }),
    ]);
    const result: any = await service.findAll(TENANT_A);
    expect(result.supplierItems[0].priceExpiryStatus).toBe('warning');
    expect(result.supplierItems[0].priceExpiryDaysLeft).toBe(20);
  });

  it('enrich reports "no_price" when there is no price, "expired" when past', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    prisma.supplierItem.findMany.mockResolvedValue([
      siRecord({ id: 'a', lastPrice: null }),
      siRecord({ id: 'b', lastPrice: 5, priceValidUntil: yesterday }),
    ]);
    const result: any = await service.findAll(TENANT_A);
    expect(result.supplierItems[0].priceExpiryStatus).toBe('no_price');
    expect(result.supplierItems[1].priceExpiryStatus).toBe('expired');
  });

  // ── expiringPrices ──────────────────────────────────────────────────────────
  it('expiringPrices (no window) scopes to tenant + rows that have an expiry date', async () => {
    await service.expiringPrices(TENANT_A);
    expect(prisma.supplierItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          deletedAt: null,
          priceValidUntil: { not: null },
        }),
      }),
    );
  });

  it('expiringPrices (window) adds an lte cutoff and aliases expiryStatus/daysUntilExpiry', async () => {
    const in5Days = new Date();
    in5Days.setDate(in5Days.getDate() + 5);
    prisma.supplierItem.findMany.mockResolvedValue([
      siRecord({ lastPrice: 10, priceValidUntil: in5Days, priceAlertDays: 30 }),
    ]);
    const rows: any = await service.expiringPrices(TENANT_A, 30);
    const where = prisma.supplierItem.findMany.mock.calls[0][0].where;
    expect(where.priceValidUntil.lte).toEqual(expect.any(Date));
    expect(rows[0].expiryStatus).toBe('critical'); // ≤ 7 days
    expect(rows[0].daysUntilExpiry).toBe(5);
  });

  // ── counts ──────────────────────────────────────────────────────────────────
  it('countsBySupplier groups tenant-scoped and returns a { supplierId: count } map', async () => {
    prisma.supplierItem.groupBy.mockResolvedValue([{ supplierId: SUP, _count: { _all: 3 } }]);
    const result = await service.countsBySupplier(TENANT_A);
    expect(prisma.supplierItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['supplierId'],
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
    expect(result).toEqual({ [SUP]: 3 });
  });

  it('countsByItem groups by itemId tenant-scoped', async () => {
    prisma.supplierItem.groupBy.mockResolvedValue([{ itemId: ITEM, _count: { _all: 2 } }]);
    const result = await service.countsByItem(TENANT_A);
    expect(prisma.supplierItem.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['itemId'] }),
    );
    expect(result).toEqual({ [ITEM]: 2 });
  });

  // ── priceHistory ────────────────────────────────────────────────────────────
  it('priceHistory 404s for an id owned by another tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    await expect(service.priceHistory(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('priceHistory returns rows scoped to tenant + supplierItem, newest first', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.supplierItemPriceHistory.findMany.mockResolvedValue([{ id: 'h1' }]);
    const rows = await service.priceHistory(TENANT_A, 'si-1');
    expect(prisma.supplierItemPriceHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, supplierItemId: 'si-1' },
        orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(rows).toEqual([{ id: 'h1' }]);
  });

  // ── updatePrice ─────────────────────────────────────────────────────────────
  const priceDto = (over: Record<string, unknown> = {}) =>
    ({ price: 48.5, validFrom: '2026-04-11', ...over }) as never;

  it('updatePrice 404s when the supplier-item is not in the tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(null);
    await expect(service.updatePrice(TENANT_B, USER, 'x', priceDto())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updatePrice writes lastPrice tenant-scoped and appends a history row', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord({ currency: 'USD' }));
    await service.updatePrice(TENANT_A, USER, 'si-1', priceDto({ validUntil: '2026-10-11' }));

    const priceWrite = writesOf(prisma.supplierItem).find((c) => c?.data?.lastPrice === 48.5);
    expect(priceWrite?.where?.tenantId).toBe(TENANT_A);
    expect(priceWrite.data.priceValidFrom).toEqual(expect.any(Date));

    expect(prisma.supplierItemPriceHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          supplierItemId: 'si-1',
          price: 48.5,
          source: 'manual',
          createdBy: USER,
        }),
      }),
    );
  });

  it('updatePrice rejects an RFQ source id that belongs to another tenant', async () => {
    prisma.supplierItem.findFirst.mockResolvedValue(siRecord());
    prisma.rfq.findFirst.mockResolvedValue(null); // foreign / bogus rfq
    await expect(
      service.updatePrice(TENANT_A, USER, 'si-1', priceDto({ source: 'rfq', rfqId: 'foreign' })),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.supplierItemPriceHistory.create).not.toHaveBeenCalled();
  });
});
