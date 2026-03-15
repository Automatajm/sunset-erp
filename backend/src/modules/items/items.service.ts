import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createItemDto: CreateItemDto) {
    // Check if item code already exists for this tenant
    const existing = await this.prisma.item.findFirst({
      where: {
        tenantId,
        code: createItemDto.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Item with code ${createItemDto.code} already exists`);
    }

    const item = await this.prisma.item.create({
      data: {
        tenantId,
        code: createItemDto.code,
        name: createItemDto.name,
        description: createItemDto.description,
        itemType: createItemDto.itemType,
        baseUom: createItemDto.baseUom,
        isStockable: createItemDto.isStockable ?? true,
        isPurchasable: createItemDto.isPurchasable ?? true,
        isSaleable: createItemDto.isSaleable ?? true,
        isManufacturable: createItemDto.isManufacturable ?? false,
        isLotTracked: createItemDto.isLotTracked ?? false,
        isSerialTracked: createItemDto.isSerialTracked ?? false,
        valuationMethod: createItemDto.valuationMethod || 'average',
        standardCost: createItemDto.standardCost,
        leadTimeDays: createItemDto.leadTimeDays ?? 0,
        safetyStock: createItemDto.safetyStock ?? 0,
        reorderPoint: createItemDto.reorderPoint ?? 0,
        reorderQuantity: createItemDto.reorderQuantity ?? 0,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return item;
  }

  async findAll(tenantId: string, itemType?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (itemType) {
      where.itemType = itemType;
    }

    const items = await this.prisma.item.findMany({
      where,
      orderBy: {
        code: 'asc',
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        itemType: true,
        baseUom: true,
        isStockable: true,
        isPurchasable: true,
        isSaleable: true,
        isManufacturable: true,
        standardCost: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return items;
  }

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!item) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    return item;
  }

  async update(tenantId: string, userId: string, id: string, updateItemDto: UpdateItemDto) {
    // Verify item exists and belongs to tenant
    await this.findOne(tenantId, id);

    // If updating code, check for duplicates
    if (updateItemDto.code) {
      const existing = await this.prisma.item.findFirst({
        where: {
          tenantId,
          code: updateItemDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`Item with code ${updateItemDto.code} already exists`);
      }
    }

    const item = await this.prisma.item.update({
      where: { id },
      data: {
        ...updateItemDto,
        updatedBy: userId,
      },
    });

    return item;
  }

  async remove(tenantId: string, userId: string, id: string) {
    // Verify item exists and belongs to tenant
    await this.findOne(tenantId, id);

    // Soft delete
    const item = await this.prisma.item.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Item deleted successfully',
      id: item.id,
    };
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

    const stockable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isStockable: true },
    });

    const purchasable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isPurchasable: true },
    });

    const saleable = await this.prisma.item.count({
      where: { tenantId, deletedAt: null, isSaleable: true },
    });

    return {
      total,
      byType: byType.map((item) => ({
        type: item.itemType,
        count: item._count,
      })),
      stockable,
      purchasable,
      saleable,
    };
  }
}
