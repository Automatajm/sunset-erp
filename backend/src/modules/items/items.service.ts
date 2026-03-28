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

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createItemDto: CreateItemDto) {
    const existing = await this.prisma.item.findFirst({
      where: { tenantId, code: createItemDto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Item with code ${createItemDto.code} already exists`);
    }

    return this.prisma.item.create({
      data: {
        tenantId,
        code:             createItemDto.code,
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

    return this.prisma.item.update({
      where: { id },
      data:  { ...updateItemDto, updatedBy: userId },
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
    const stockable    = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isStockable: true } });
    const purchasable  = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isPurchasable: true } });
    const saleable     = await this.prisma.item.count({ where: { tenantId, deletedAt: null, isSaleable: true } });
    const withCategory = await this.prisma.item.count({ where: { tenantId, deletedAt: null, categoryId: { not: null } } });
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