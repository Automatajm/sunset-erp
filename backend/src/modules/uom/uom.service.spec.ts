// ============================================================================
// Unit tests for UomService — spec-005-uom
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
//
// NOTE: UomUnit / UomConversion are GLOBAL reference catalogs (no tenantId,
// no deletedAt — cfg_uom_* tables). Catalog reads intentionally omit tenant
// scoping; the tenant-scoping assertions below target calcAllQties, which is
// the only path that touches tenant-owned data (Item, SupplierItem).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UomService } from './uom.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SI_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const unit = (over: Record<string, any> = {}) => ({
  id: 'u-gal',
  code: 'GAL',
  name: 'Gallon',
  type: 'volume',
  system: 'imperial',
  isBase: false,
  isActive: true,
  symbol: 'gal',
  ...over,
});

const itemRow = (over: Record<string, any> = {}) => ({
  id: ITEM_ID,
  tenantId: TENANT_A,
  baseUom: 'LTR',
  purchaseUomId: 'u-gal',
  storageUomId: 'u-ltr',
  consumptionUomId: 'u-ltr',
  purchaseUom: { id: 'u-gal', code: 'GAL' },
  storageUom: { id: 'u-ltr', code: 'LTR' },
  consumptionUom: { id: 'u-ltr', code: 'LTR' },
  purchaseToConsumptionFactor: 3.785,
  storageToConsumptionFactor: 1,
  ...over,
});

describe('UomService', () => {
  let service: UomService;
  let prisma: {
    uomUnit: Record<string, jest.Mock>;
    uomConversion: Record<string, jest.Mock>;
    item: Record<string, jest.Mock>;
    supplierItem: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      uomUnit: { findMany: jest.fn(), findUnique: jest.fn() },
      uomConversion: { findMany: jest.fn(), findUnique: jest.fn() },
      item: { findFirst: jest.fn() },
      supplierItem: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [UomService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(UomService);
  });

  // ── findAllUnits ───────────────────────────────────────────────────────────
  describe('findAllUnits', () => {
    it('filters active units, applies type + system, and orders the result', async () => {
      prisma.uomUnit.findMany.mockResolvedValue([unit()]);
      await service.findAllUnits({ type: 'volume', system: 'imperial' });
      expect(prisma.uomUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, type: 'volume', system: 'imperial' },
          orderBy: expect.any(Array),
        }),
      );
    });

    it('omits type/system from where when not provided', async () => {
      prisma.uomUnit.findMany.mockResolvedValue([]);
      await service.findAllUnits();
      expect(prisma.uomUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  // ── findOneUnit / findUnitByCode ─────────────────────────────────────────────
  describe('findOneUnit', () => {
    it('returns the unit when found', async () => {
      prisma.uomUnit.findUnique.mockResolvedValue(unit());
      await expect(service.findOneUnit('u-gal')).resolves.toMatchObject({ code: 'GAL' });
    });
    it('throws NotFoundException when missing', async () => {
      prisma.uomUnit.findUnique.mockResolvedValue(null);
      await expect(service.findOneUnit('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findUnitByCode', () => {
    it('throws NotFoundException for an unknown code', async () => {
      prisma.uomUnit.findUnique.mockResolvedValue(null);
      await expect(service.findUnitByCode('ZZZ')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAllConversions ───────────────────────────────────────────────────────
  describe('findAllConversions', () => {
    it('filters active and includes fromUom/toUom selects', async () => {
      prisma.uomConversion.findMany.mockResolvedValue([]);
      await service.findAllConversions();
      expect(prisma.uomConversion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          include: expect.objectContaining({
            fromUom: expect.any(Object),
            toUom: expect.any(Object),
          }),
        }),
      );
    });
  });

  // ── convert ──────────────────────────────────────────────────────────────────
  describe('convert', () => {
    it('returns identity (factor 1) without a DB hit when from === to', async () => {
      const out = await service.convert('LTR', 'LTR', 5);
      expect(out).toMatchObject({ outputQty: 5, factor: 1, isAutomatic: true });
      expect(prisma.uomUnit.findUnique).not.toHaveBeenCalled();
      expect(prisma.uomConversion.findUnique).not.toHaveBeenCalled();
    });

    it('computes outputQty = qty × factor (rounded to 6dp)', async () => {
      prisma.uomUnit.findUnique
        .mockResolvedValueOnce(unit({ id: 'u-gal', code: 'GAL' }))
        .mockResolvedValueOnce(
          unit({ id: 'u-ltr', code: 'LTR', type: 'volume', system: 'metric' }),
        );
      prisma.uomConversion.findUnique.mockResolvedValue({ factor: 3.78541178 });
      const out = await service.convert('GAL', 'LTR', 2);
      expect(out.factor).toBeCloseTo(3.78541178, 6);
      expect(out.outputQty).toBeCloseTo(7.570824, 6);
    });

    it('throws NotFoundException when no conversion row exists between two codes', async () => {
      prisma.uomUnit.findUnique
        .mockResolvedValueOnce(unit({ id: 'u-gal', code: 'GAL' }))
        .mockResolvedValueOnce(unit({ id: 'u-kg', code: 'KG', type: 'mass' }));
      prisma.uomConversion.findUnique.mockResolvedValue(null);
      await expect(service.convert('GAL', 'KG', 1)).rejects.toThrow(NotFoundException);
    });

    // [GAP] AC "convert throws BadRequestException when qty is NaN, <= 0, or missing"
    it('[GAP] throws BadRequestException when qty is NaN', async () => {
      await expect(service.convert('GAL', 'LTR', Number('abc'))).rejects.toThrow(
        BadRequestException,
      );
    });
    it('[GAP] throws BadRequestException when qty <= 0', async () => {
      await expect(service.convert('GAL', 'LTR', -1)).rejects.toThrow(BadRequestException);
    });
  });

  // ── getConversionFactor (cross-module helper) ────────────────────────────────
  describe('getConversionFactor', () => {
    it('returns 1 for identical uom ids', async () => {
      await expect(service.getConversionFactor('u-x', 'u-x')).resolves.toBe(1);
    });
    it('returns null when no conversion exists', async () => {
      prisma.uomConversion.findUnique.mockResolvedValue(null);
      await expect(service.getConversionFactor('u-a', 'u-b')).resolves.toBeNull();
    });
  });

  // ── calcAllQties (TENANT-SCOPED path) ────────────────────────────────────────
  describe('calcAllQties', () => {
    it('scopes the Item read with { id, tenantId, deletedAt: null }', async () => {
      prisma.item.findFirst.mockResolvedValue(itemRow());
      await service.calcAllQties(10, ITEM_ID, TENANT_A);
      expect(prisma.item.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: ITEM_ID, tenantId: TENANT_A, deletedAt: null }),
        }),
      );
    });

    it('scopes the SupplierItem read with { id, tenantId, deletedAt: null }', async () => {
      prisma.item.findFirst.mockResolvedValue(itemRow());
      prisma.supplierItem.findFirst.mockResolvedValue({ conversionFactor: 4 });
      await service.calcAllQties(10, ITEM_ID, TENANT_A, SI_ID);
      expect(prisma.supplierItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: SI_ID, tenantId: TENANT_A, deletedAt: null }),
        }),
      );
    });

    it('throws NotFoundException when the item is absent (incl. wrong tenant)', async () => {
      prisma.item.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
      await expect(service.calcAllQties(10, ITEM_ID, TENANT_B)).rejects.toThrow(NotFoundException);
    });

    it('prefers SupplierItem.conversionFactor over the catalog/item fallback', async () => {
      prisma.item.findFirst.mockResolvedValue(itemRow());
      prisma.supplierItem.findFirst.mockResolvedValue({ conversionFactor: 4 });
      const out = await service.calcAllQties(2, ITEM_ID, TENANT_A, SI_ID);
      expect(out.consumptionQty).toBeCloseTo(8, 6); // 2 × 4
      expect(out.purchaseUom).toBe('GAL');
    });
  });

  // ── calcNewWAC (financial primitive, ADR-019) ────────────────────────────────
  describe('calcNewWAC', () => {
    it('computes the weighted average of existing + incoming', () => {
      // (10×5 + 10×7) / 20 = 6
      const r = service.calcNewWAC(10, 5, 10, 7);
      expect(r.newUnitCost).toBeCloseTo(6, 4);
      expect(r.newPurchaseQty).toBe(20);
      expect(r.totalValue).toBeCloseTo(120, 2);
    });
    it('guards a zero total quantity', () => {
      expect(service.calcNewWAC(0, 0, 0, 0)).toEqual({
        newUnitCost: 0,
        newPurchaseQty: 0,
        totalValue: 0,
      });
    });
  });

  // ── calcFinancialValue (always values in purchaseUom) ─────────────────────────
  describe('calcFinancialValue', () => {
    const item = { unitCost: 10, purchaseToConsumptionFactor: 2, storageToConsumptionFactor: 1 };
    it('purchase: direct qty × unitCost', () => {
      expect(service.calcFinancialValue(3, 'purchase', item)).toBeCloseTo(30, 2);
    });
    it('consumption: converts to purchase before valuing', () => {
      // 4 consumption / factor 2 = 2 purchase × 10 = 20
      expect(service.calcFinancialValue(4, 'consumption', item)).toBeCloseTo(20, 2);
    });
    it('storage: storage → consumption → purchase', () => {
      // 4 storage ×1 = 4 consumption /2 = 2 purchase ×10 = 20
      expect(service.calcFinancialValue(4, 'storage', item)).toBeCloseTo(20, 2);
    });
  });
});
