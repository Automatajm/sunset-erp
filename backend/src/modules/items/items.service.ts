import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

// Relations included in all item responses
const ITEM_INCLUDE = {
  category: {
    select: {
      id: true, code: true, name: true,
      macroCategory: { select: { id: true, code: true, name: true } },
    },
  },
  purchaseUom:    { select: { id: true, code: true, name: true, type: true, system: true } },
  storageUom:     { select: { id: true, code: true, name: true, type: true, system: true } },
  consumptionUom: { select: { id: true, code: true, name: true, type: true, system: true } },
  consumptionGroup: { select: { id: true, code: true, name: true } },
  supplierItems: {
    where: { deletedAt: null, isActive: true },
    orderBy: [{ isPreferred: 'desc' as const }, { supplier: { name: 'asc' as const } }],
    select: {
      id: true, supplierId: true, purchaseUomId: true,
      supplierItemCode: true, supplierItemName: true,
      packSize: true, conversionFactor: true,
      lastPrice: true, leadTimeDays: true, moq: true,
      isPreferred: true, isActive: true, notes: true,
      supplier:    { select: { id: true, code: true, name: true } },
      purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
    },
  },
};

// Numeric fields that must be coerced to Number before hitting Prisma
const NUMERIC_FIELDS = [
  'standardCost', 'leadTimeDays', 'safetyStock',
  'reorderPoint', 'reorderQuantity',
  'purchaseToConsumptionFactor', 'storageToConsumptionFactor',
];

@Injectable()
export class ItemsService {
  constructor(
    private prisma:      PrismaService,
    private uomService:  UomService,
  ) {}

  // ── Auto-code generator ────────────────────────────────────────────────────
  private async generateItemCode(tenantId: string): Promise<string> {
    const PREFIX = 'ITEM-';
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
  // Returns the factor from `fromUomId` to `toUomId` (consumption base).
  // Falls back to the provided manual value if catalog lookup fails.
  private async resolveConversionFactor(
    fromUomId: string | undefined,
    toUomId:   string | undefined,
    manualFactor: number,
  ): Promise<number> {
    // If same UOM or missing, factor is always 1
    if (!fromUomId || !toUomId || fromUomId === toUomId) return 1;

    // Only auto-calculate when manual factor is the default (1) — meaning
    // the user didn't explicitly set a custom value
    if (manualFactor !== 1) return manualFactor;

    try {
      const autoFactor = await this.uomService.getConversionFactor(fromUomId, toUomId);
      if (autoFactor && autoFactor !== 1) return autoFactor;
    } catch {
      // Catalog doesn't have this conversion — keep manual
    }
    return manualFactor;
  }

  async create(tenantId: string, userId: string, dto: CreateItemDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.generateItemCode(tenantId);

    const existing = await this.prisma.item.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Item with code ${code} already exists`);

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
        name:               dto.name,
        description:        dto.description,
        itemType:           dto.itemType,
        baseUom:            dto.baseUom,
        categoryId:         dto.categoryId,
        consumptionGroupId: dto.consumptionGroupId,
        // UOM triple — with auto-calculated factors
        purchaseUomId:               dto.purchaseUomId,
        purchaseToConsumptionFactor: purchaseFactor,
        storageUomId:                dto.storageUomId,
        storageToConsumptionFactor:  storageFactor,
        consumptionUomId:            dto.consumptionUomId,
        // Flags
        isStockable:      dto.isStockable      ?? true,
        isPurchasable:    dto.isPurchasable    ?? true,
        isSaleable:       dto.isSaleable       ?? true,
        isManufacturable: dto.isManufacturable ?? false,
        isLotTracked:     dto.isLotTracked     ?? false,
        isSerialTracked:  dto.isSerialTracked  ?? false,
        // Valuation
        valuationMethod: dto.valuationMethod || 'average',
        standardCost:    dto.standardCost,
        // Planning
        leadTimeDays:    dto.leadTimeDays    ?? 0,
        safetyStock:     dto.safetyStock     ?? 0,
        reorderPoint:    dto.reorderPoint    ?? 0,
        reorderQuantity: dto.reorderQuantity ?? 0,
        isActive:  true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: ITEM_INCLUDE,
    });
  }

  async findAll(tenantId: string, itemType?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (itemType) where.itemType = itemType;
    return this.prisma.item.findMany({
      where,
      orderBy: { code: 'asc' },
      include: ITEM_INCLUDE,
    });
  }

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: ITEM_INCLUDE,
    });
    if (!item) throw new NotFoundException(`Item with ID ${id} not found`);
    return item;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateItemDto) {
    const current = await this.findOne(tenantId, id);

    if (dto.code) {
      const existing = await this.prisma.item.findFirst({
        where: { tenantId, code: dto.code, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictException(`Item with code ${dto.code} already exists`);
    }

    // Resolve effective UOM IDs — use incoming or fall back to current saved
    const a = current as any;
    const effectivePurchaseUom    = dto.purchaseUomId    ?? a.purchaseUomId;
    const effectiveStorageUom     = dto.storageUomId     ?? a.storageUomId;
    const effectiveConsumptionUom = dto.consumptionUomId ?? a.consumptionUomId;

    // Build clean data — skip undefined/null/empty, coerce numerics
    const data: any = { updatedBy: userId };
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined || v === null || v === '') continue;
      data[k] = NUMERIC_FIELDS.includes(k) ? Number(v) : v;
    }

    // Auto-calculate factors when UOM fields are being changed
    const isPurchaseUomChanging = dto.purchaseUomId !== undefined || dto.consumptionUomId !== undefined;
    const isStorageUomChanging  = dto.storageUomId  !== undefined || dto.consumptionUomId !== undefined;

    if (isPurchaseUomChanging && effectiveConsumptionUom) {
      const manualPurchaseFactor = data.purchaseToConsumptionFactor ?? Number(a.purchaseToConsumptionFactor ?? 1);
      const autoPurchaseFactor = await this.resolveConversionFactor(
        effectivePurchaseUom,
        effectiveConsumptionUom,
        // If user explicitly sent a factor value != 1, respect it; otherwise auto-calc
        dto.purchaseToConsumptionFactor !== undefined ? manualPurchaseFactor : 1,
      );
      data.purchaseToConsumptionFactor = autoPurchaseFactor;
    }

    if (isStorageUomChanging && effectiveConsumptionUom) {
      const manualStorageFactor = data.storageToConsumptionFactor ?? Number(a.storageToConsumptionFactor ?? 1);
      const autoStorageFactor = await this.resolveConversionFactor(
        effectiveStorageUom,
        effectiveConsumptionUom,
        dto.storageToConsumptionFactor !== undefined ? manualStorageFactor : 1,
      );
      data.storageToConsumptionFactor = autoStorageFactor;
    }

    return this.prisma.item.update({
      where: { id },
      data,
      include: ITEM_INCLUDE,
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    const item = await this.prisma.item.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Item deleted successfully', id: item.id };
  }

  async getStatistics(tenantId: string) {
    const total = await this.prisma.item.count({ where: { tenantId, deletedAt: null } });
    const byType = await this.prisma.item.groupBy({
      by: ['itemType'], where: { tenantId, deletedAt: null }, _count: true,
    });
    const stockable     = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isStockable: true } });
    const purchasable   = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isPurchasable: true } });
    const saleable      = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isSaleable: true } });
    const withCategory  = await this.prisma.item.count({ where: { tenantId, deletedAt: null, categoryId: { not: null } } });
    const withUomTriple = await this.prisma.item.count({ where: { tenantId, deletedAt: null, consumptionUomId: { not: null } } });

    return {
      total,
      byType: byType.map(i => ({ type: i.itemType, count: i._count })),
      stockable, purchasable, saleable, withCategory, withUomTriple,
    };
  }
}