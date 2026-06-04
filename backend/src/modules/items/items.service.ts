// ============================================================================
// FILE: backend/src/modules/items/items.service.ts
// ============================================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

// Relations included in all item responses
const ITEM_INCLUDE = {
  category: {
    select: {
      id: true,
      code: true,
      name: true,
      macroCategory: { select: { id: true, code: true, name: true } },
    },
  },
  purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
  storageUom: { select: { id: true, code: true, name: true, type: true, system: true } },
  consumptionUom: { select: { id: true, code: true, name: true, type: true, system: true } },
  consumptionGroup: { select: { id: true, code: true, name: true } },
  supplierItems: {
    where: { deletedAt: null, isActive: true },
    orderBy: [{ isPreferred: 'desc' as const }, { supplier: { name: 'asc' as const } }],
    select: {
      id: true,
      supplierId: true,
      purchaseUomId: true,
      supplierItemCode: true,
      supplierItemName: true,
      packSize: true,
      conversionFactor: true,
      lastPrice: true,
      leadTimeDays: true,
      moq: true,
      isPreferred: true,
      isActive: true,
      notes: true,
      supplier: { select: { id: true, code: true, name: true } },
      purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
    },
  },
};

// Numeric fields that must be coerced to Number before hitting Prisma
const NUMERIC_FIELDS = [
  'standardCost',
  'leadTimeDays',
  'safetyStock',
  'reorderPoint',
  'reorderQuantity',
  'purchaseToConsumptionFactor',
  'storageToConsumptionFactor',
];

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private uomService: UomService,
  ) {}

  // ── Auto-code generator ────────────────────────────────────────────────────
  private async generateItemCode(tenantId: string): Promise<string> {
    const PREFIX = 'ITEM-';
    // NOTE: intentionally NOT scoped to `deletedAt: null`. The `@@unique([tenantId, code])`
    // constraint spans soft-deleted rows, so a soft-deleted item still occupies its code.
    // Considering all codes (including soft-deleted) guarantees we never regenerate a code that
    // would collide on the unique constraint.
    const items = await this.prisma.item.findMany({
      where: { tenantId, code: { startsWith: PREFIX } },
      select: { code: true },
    });
    let max = 0;
    for (const { code } of items) {
      const n = parseInt(code.slice(PREFIX.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return `${PREFIX}${String(max + 1).padStart(4, '0')}`;
  }

  // ── Auto-calculate UOM conversion factors from catalog ─────────────────────
  private async resolveConversionFactor(
    fromUomId: string | undefined,
    toUomId: string | undefined,
    manualFactor: number,
  ): Promise<number> {
    if (!fromUomId || !toUomId || fromUomId === toUomId) return 1;
    if (manualFactor !== 1) return manualFactor;
    try {
      const autoFactor = await this.uomService.getConversionFactor(fromUomId, toUomId);
      if (autoFactor && autoFactor !== 1) return autoFactor;
    } catch {
      /* keep manual */
    }
    return manualFactor;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateItemDto) {
    // Codes are always system-assigned (spec-012) — generator spans soft-deleted
    // rows and never collides among active rows.
    const code = await this.generateItemCode(tenantId);

    // Auto-generate barcodeInternal from code if not provided
    const barcodeInternal = dto.barcodeInternal?.trim() || code;

    // Auto-calculate conversion factors from UOM catalog
    const purchaseFactor = await this.resolveConversionFactor(
      dto.purchaseUomId,
      dto.consumptionUomId,
      dto.purchaseToConsumptionFactor ?? 1,
    );
    const storageFactor = await this.resolveConversionFactor(
      dto.storageUomId,
      dto.consumptionUomId,
      dto.storageToConsumptionFactor ?? 1,
    );

    return this.prisma.item.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        description: dto.description,
        itemType: dto.itemType,
        baseUom: dto.baseUom,
        categoryId: dto.categoryId,
        consumptionGroupId: dto.consumptionGroupId,
        // Sprint 14F — Barcodes
        barcodeInternal,
        barcodeExternal: dto.barcodeExternal?.trim() || null,
        // UOM triple
        purchaseUomId: dto.purchaseUomId,
        purchaseToConsumptionFactor: purchaseFactor,
        storageUomId: dto.storageUomId,
        storageToConsumptionFactor: storageFactor,
        consumptionUomId: dto.consumptionUomId,
        // Flags
        isStockable: dto.isStockable ?? true,
        isPurchasable: dto.isPurchasable ?? true,
        isSaleable: dto.isSaleable ?? true,
        isManufacturable: dto.isManufacturable ?? false,
        isLotTracked: dto.isLotTracked ?? false,
        isSerialTracked: dto.isSerialTracked ?? false,
        // Valuation
        valuationMethod: dto.valuationMethod || 'average',
        standardCost: dto.standardCost,
        // Planning
        leadTimeDays: dto.leadTimeDays ?? 0,
        safetyStock: dto.safetyStock ?? 0,
        reorderPoint: dto.reorderPoint ?? 0,
        reorderQuantity: dto.reorderQuantity ?? 0,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: ITEM_INCLUDE,
    });
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, itemType?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (itemType) where.itemType = itemType;
    // Item has no sensitive (banking/PII) columns, so the list returns the full row;
    // the envelope just adds `count` to match the list-response convention.
    const items = await this.prisma.item.findMany({
      where,
      orderBy: { code: 'asc' },
      include: ITEM_INCLUDE,
    });
    return { items, count: items.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (!item) throw new NotFoundException(`Item with ID ${id} not found`);
    return item;
  }

  // ── Find by Barcode (Sprint 14F) ───────────────────────────────────────────
  // Searches by: internal barcode, external barcode, item code, or supplier item code
  // Used by mobile count scanner — accepts any scan input and returns the item

  async findByBarcode(tenantId: string, scan: string) {
    const q = scan.trim();

    // 1. Try internal barcode (exact match)
    let item = await this.prisma.item.findFirst({
      where: { tenantId, barcodeInternal: q, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (item) return { item, matchedBy: 'barcodeInternal' };

    // 2. Try external barcode (exact match)
    item = await this.prisma.item.findFirst({
      where: { tenantId, barcodeExternal: q, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (item) return { item, matchedBy: 'barcodeExternal' };

    // 3. Try item code (case-insensitive)
    item = await this.prisma.item.findFirst({
      where: { tenantId, code: { equals: q, mode: 'insensitive' }, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (item) return { item, matchedBy: 'itemCode' };

    // 4. Try supplier item code (any supplier)
    const supplierItem = await this.prisma.supplierItem.findFirst({
      where: {
        tenantId,
        supplierItemCode: { equals: q, mode: 'insensitive' },
        deletedAt: null,
        isActive: true,
      },
      include: { item: { include: ITEM_INCLUDE } },
    });
    if (supplierItem?.item) {
      return {
        item: supplierItem.item,
        matchedBy: 'supplierItemCode',
        supplierId: supplierItem.supplierId,
      };
    }

    throw new NotFoundException(`No item found for barcode/code "${q}"`);
  }

  // ── Lookup multiple barcodes (batch scan) ──────────────────────────────────
  // Used by bulk location import to resolve itemCodes/barcodes in one call

  async findManyByCodes(tenantId: string, codes: string[]) {
    const items = await this.prisma.item.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { code: { in: codes, mode: 'insensitive' } },
          { barcodeInternal: { in: codes } },
          { barcodeExternal: { in: codes } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        itemType: true,
        baseUom: true,
        barcodeInternal: true,
        barcodeExternal: true,
        purchaseUom: { select: { code: true } },
        storageUom: { select: { code: true } },
      },
    });
    return items;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateItemDto) {
    const current = await this.findOne(tenantId, id);

    // Codes are immutable (spec-012) — the DTO no longer carries one.

    // Resolve effective UOM IDs
    const a = current as any;
    const effectivePurchaseUom = dto.purchaseUomId ?? a.purchaseUomId;
    const effectiveStorageUom = dto.storageUomId ?? a.storageUomId;
    const effectiveConsumptionUom = dto.consumptionUomId ?? a.consumptionUomId;

    // Build clean data
    const data: any = { updatedBy: userId };
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined || v === null || v === '') continue;
      data[k] = NUMERIC_FIELDS.includes(k) ? Number(v) : v;
    }

    // If code changed and barcodeInternal was auto-generated from code, update it too

    // Auto-calculate factors when UOM fields are being changed
    const isPurchaseUomChanging =
      dto.purchaseUomId !== undefined || dto.consumptionUomId !== undefined;
    const isStorageUomChanging =
      dto.storageUomId !== undefined || dto.consumptionUomId !== undefined;

    if (isPurchaseUomChanging && effectiveConsumptionUom) {
      const manualPurchaseFactor =
        data.purchaseToConsumptionFactor ?? Number(a.purchaseToConsumptionFactor ?? 1);
      const autoPurchaseFactor = await this.resolveConversionFactor(
        effectivePurchaseUom,
        effectiveConsumptionUom,
        dto.purchaseToConsumptionFactor !== undefined ? manualPurchaseFactor : 1,
      );
      data.purchaseToConsumptionFactor = autoPurchaseFactor;
    }

    if (isStorageUomChanging && effectiveConsumptionUom) {
      const manualStorageFactor =
        data.storageToConsumptionFactor ?? Number(a.storageToConsumptionFactor ?? 1);
      const autoStorageFactor = await this.resolveConversionFactor(
        effectiveStorageUom,
        effectiveConsumptionUom,
        dto.storageToConsumptionFactor !== undefined ? manualStorageFactor : 1,
      );
      data.storageToConsumptionFactor = autoStorageFactor;
    }

    // Tenant-scoped write: the write itself enforces tenancy, not just the preceding findOne.
    await this.prisma.item.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
    return this.findOne(tenantId, id);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const item = await this.findOne(tenantId, id);
    // Tenant-scoped soft delete: the write itself enforces tenancy.
    await this.prisma.item.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Item deleted successfully', id: item.id };
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  async getStatistics(tenantId: string) {
    const total = await this.prisma.item.count({ where: { tenantId, deletedAt: null } });
    const byType = await this.prisma.item.groupBy({
      by: ['itemType'],
      where: { tenantId, deletedAt: null },
      _count: true,
    });
    const stockable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isStockable: true },
    });
    const purchasable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isPurchasable: true },
    });
    const saleable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isSaleable: true },
    });
    const withCategory = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, categoryId: { not: null } },
    });
    const withUomTriple = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, consumptionUomId: { not: null } },
    });
    const withBarcode = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, barcodeInternal: { not: null } },
    });
    const withExternalBarcode = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, barcodeExternal: { not: null } },
    });

    return {
      total,
      byType: byType.map((i) => ({ type: i.itemType, count: i._count })),
      stockable,
      purchasable,
      saleable,
      withCategory,
      withUomTriple,
      withBarcode,
      withExternalBarcode,
    };
  }
}
