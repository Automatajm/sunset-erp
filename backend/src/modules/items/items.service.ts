import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  // Auto-generate code: ITEM-0001, ITEM-0002, ...
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

  async create(tenantId: string, userId: string, createItemDto: CreateItemDto) {
    // Use provided code or auto-generate
    const code = createItemDto.code?.trim()
      ? createItemDto.code.trim().toUpperCase()
      : await this.generateItemCode(tenantId);

    const existing = await this.prisma.item.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Item with code ${code} already exists`);
    }

    return this.prisma.item.create({
      data: {
        tenantId,
        code,
        name:             createItemDto.name,
        description:      createItemDto.description,
        itemType:         createItemDto.itemType,
        baseUom:          createItemDto.baseUom,
        categoryId:       createItemDto.categoryId,
        consumptionGroupId: createItemDto.consumptionGroupId,
        // UOM triple
        purchaseUomId:               createItemDto.purchaseUomId,
        purchaseToConsumptionFactor: createItemDto.purchaseToConsumptionFactor ?? 1,
        storageUomId:                createItemDto.storageUomId,
        storageToConsumptionFactor:  createItemDto.storageToConsumptionFactor ?? 1,
        consumptionUomId:            createItemDto.consumptionUomId,
        // Flags
        isStockable:      createItemDto.isStockable      ?? true,
        isPurchasable:    createItemDto.isPurchasable    ?? true,
        isSaleable:       createItemDto.isSaleable       ?? true,
        isManufacturable: createItemDto.isManufacturable ?? false,
        isLotTracked:     createItemDto.isLotTracked     ?? false,
        isSerialTracked:  createItemDto.isSerialTracked  ?? false,
        // Valuation
        valuationMethod: createItemDto.valuationMethod || 'average',
        standardCost:    createItemDto.standardCost,
        // Planning
        leadTimeDays:    createItemDto.leadTimeDays    ?? 0,
        safetyStock:     createItemDto.safetyStock     ?? 0,
        reorderPoint:    createItemDto.reorderPoint    ?? 0,
        reorderQuantity: createItemDto.reorderQuantity ?? 0,
        isActive: true,
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

  async update(tenantId: string, userId: string, id: string, updateItemDto: UpdateItemDto) {
    await this.findOne(tenantId, id);

    if (updateItemDto.code) {
      const existing = await this.prisma.item.findFirst({
        where: { tenantId, code: updateItemDto.code, id: { not: id }, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException(`Item with code ${updateItemDto.code} already exists`);
      }
    }

    // Build clean data object:
    // - Skip undefined / null / empty string fields (don't overwrite with null)
    // - Coerce numeric fields to Number (HTTP body may deliver them as strings)
    const data: any = { updatedBy: userId };
    for (const [k, v] of Object.entries(updateItemDto)) {
      if (v === undefined || v === null || v === '') continue;
      data[k] = NUMERIC_FIELDS.includes(k) ? Number(v) : v;
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
    const total = await this.prisma.item.count({
      where: { tenantId, deletedAt: null },
    });
    const byType = await this.prisma.item.groupBy({
      by: ['itemType'],
      where: { tenantId, deletedAt: null },
      _count: true,
    });
    const stockable     = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isStockable: true } });
    const purchasable   = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isPurchasable: true } });
    const saleable      = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isSaleable: true } });
    const withCategory  = await this.prisma.item.count({ where: { tenantId, deletedAt: null, categoryId: { not: null } } });
    const withUomTriple = await this.prisma.item.count({ where: { tenantId, deletedAt: null, consumptionUomId: { not: null } } });

    return {
      total,
      byType:       byType.map(i => ({ type: i.itemType, count: i._count })),
      stockable,
      purchasable,
      saleable,
      withCategory,
      withUomTriple,
    };
  }
}