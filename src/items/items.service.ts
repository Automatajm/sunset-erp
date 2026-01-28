import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto, UpdateItemDto, QueryItemsDto, AddUnitConversionDto } from './dto';
import { Prisma, UnitPurpose } from '@prisma/client';

@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateItemDto, tenantId: string, userId: string) {
    // Verificar que el cÃ³digo no exista
    const exists = await this.prisma.item.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });

    if (exists) {
      throw new ConflictException(`Item with code ${dto.code} already exists`);
    }

    // Verificar que la categorÃ­a exista
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Category not found');
    }

    // Verificar que la unidad base exista
    const baseUnit = await this.prisma.unitOfMeasure.findUnique({
      where: { id: dto.baseUnitId },
    });

    if (!baseUnit) {
      throw new NotFoundException('Base unit not found');
    }

    // Crear item
    const item = await this.prisma.item.create({
      data: {
        ...dto,
        tenantId,
        createdBy: userId,
        isActive: true,
      },
      include: {
        category: true,
        baseUnit: true,
      },
    });

    return item;
  }

  async findAll(tenantId: string, query: QueryItemsDto) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      itemType,
      categoryId,
      isSellable,
      isPurchasable,
      isInventoriable,
      isActive = true,
    } = query;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.ItemWhereInput = {
      tenantId,
      deletedAt: null,
      ...(isActive !== undefined && { isActive }),
      ...(itemType && { itemType }),
      ...(categoryId && { categoryId }),
      ...(isSellable !== undefined && { isSellable }),
      ...(isPurchasable !== undefined && { isPurchasable }),
      ...(isInventoriable !== undefined && { isInventoriable }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Ejecutar consulta
    const [items, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          category: true,
          baseUnit: true,
          unitConversions: {
            include: {
              unit: true,
            },
          },
        },
      }),
      this.prisma.item.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, tenantId: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        category: {
          include: {
            parent: true,
          },
        },
        baseUnit: {
          include: {
            category: true,
          },
        },
        unitConversions: {
          where: { isActive: true },
          include: {
            unit: {
              include: {
                category: true,
              },
            },
          },
          orderBy: [
            { purpose: 'asc' },
            { isDefault: 'desc' },
          ],
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  async update(id: string, tenantId: string, dto: UpdateItemDto) {
    const item = await this.findOne(id, tenantId);

    // Si se estÃ¡ cambiando el cÃ³digo, verificar que no exista
    if (dto.code && dto.code !== item.code) {
      const exists = await this.prisma.item.findUnique({
        where: { tenantId_code: { tenantId, code: dto.code } },
      });

      if (exists) {
        throw new ConflictException(`Item with code ${dto.code} already exists`);
      }
    }

    // Si se estÃ¡ cambiando la categorÃ­a, verificar que exista
    if (dto.categoryId && dto.categoryId !== item.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category || category.tenantId !== tenantId) {
        throw new NotFoundException('Category not found');
      }
    }

    // Si se estÃ¡ cambiando la unidad base, verificar que exista
    if (dto.baseUnitId && dto.baseUnitId !== item.baseUnitId) {
      const baseUnit = await this.prisma.unitOfMeasure.findUnique({
        where: { id: dto.baseUnitId },
      });

      if (!baseUnit) {
        throw new NotFoundException('Base unit not found');
      }
    }

    const updated = await this.prisma.item.update({
      where: { id },
      data: {
        ...dto,
        version: { increment: 1 },
      },
      include: {
        category: true,
        baseUnit: true,
        unitConversions: {
          include: {
            unit: true,
          },
        },
      },
    });

    return updated;
  }

  async remove(id: string, tenantId: string, userId: string) {
    const item = await this.findOne(id, tenantId);

    // Soft delete
    await this.prisma.item.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        isActive: false,
      },
    });

    return { message: 'Item deleted successfully' };
  }

  // ============================================
  // GESTIÃ“N DE CONVERSIONES DE UNIDADES
  // ============================================

  async addUnitConversion(itemId: string, tenantId: string, dto: AddUnitConversionDto) {
    const item = await this.findOne(itemId, tenantId);

    // Verificar que la unidad exista
    const unit = await this.prisma.unitOfMeasure.findUnique({
      where: { id: dto.unitId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    // Verificar que no exista ya esta conversiÃ³n
    const exists = await this.prisma.itemUnitConversion.findUnique({
      where: {
        itemId_purpose_unitId: {
          itemId,
          purpose: dto.purpose,
          unitId: dto.unitId,
        },
      },
    });

    if (exists) {
      throw new ConflictException('This unit conversion already exists for this purpose');
    }

    // Si es default, desactivar otros defaults del mismo propÃ³sito
    if (dto.isDefault) {
      await this.prisma.itemUnitConversion.updateMany({
        where: {
          itemId,
          purpose: dto.purpose,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const conversion = await this.prisma.itemUnitConversion.create({
      data: {
        itemId,
        ...dto,
      },
      include: {
        unit: {
          include: {
            category: true,
          },
        },
      },
    });

    return conversion;
  }

  async getUnitConversions(itemId: string, tenantId: string, purpose?: UnitPurpose) {
    await this.findOne(itemId, tenantId);

    const conversions = await this.prisma.itemUnitConversion.findMany({
      where: {
        itemId,
        isActive: true,
        ...(purpose && { purpose }),
      },
      include: {
        unit: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [
        { purpose: 'asc' },
        { isDefault: 'desc' },
      ],
    });

    return conversions;
  }

  async removeUnitConversion(itemId: string, conversionId: string, tenantId: string) {
    await this.findOne(itemId, tenantId);

    const conversion = await this.prisma.itemUnitConversion.findUnique({
      where: { id: conversionId },
    });

    if (!conversion || conversion.itemId !== itemId) {
      throw new NotFoundException('Unit conversion not found');
    }

    await this.prisma.itemUnitConversion.delete({
      where: { id: conversionId },
    });

    return { message: 'Unit conversion removed successfully' };
  }

  // ============================================
  // CONVERSIONES Y CÃLCULOS
  // ============================================

  async convertQuantity(
    itemId: string,
    tenantId: string,
    fromUnitId: string,
    toUnitId: string,
    quantity: number,
  ) {
    const item = await this.findOne(itemId, tenantId);

    // Si las unidades son iguales, no hay conversiÃ³n
    if (fromUnitId === toUnitId) {
      return { quantity, convertedQuantity: quantity };
    }

    // Obtener factores de conversiÃ³n
    const fromConversion = await this.prisma.itemUnitConversion.findFirst({
      where: { itemId, unitId: fromUnitId, isActive: true },
      include: { unit: true },
    });

    const toConversion = await this.prisma.itemUnitConversion.findFirst({
      where: { itemId, unitId: toUnitId, isActive: true },
      include: { unit: true },
    });

    if (!fromConversion) {
      throw new BadRequestException('Source unit not configured for this item');
    }

    if (!toConversion) {
      throw new BadRequestException('Target unit not configured for this item');
    }

    // Convertir a unidad base primero, luego a unidad destino
    const baseQuantity = quantity * parseFloat(fromConversion.factor.toString());
    const convertedQuantity = baseQuantity / parseFloat(toConversion.factor.toString());

    return {
      quantity,
      fromUnit: fromConversion.unit,
      toUnit: toConversion.unit,
      convertedQuantity,
      baseQuantity,
      baseUnit: item.baseUnit,
    };
  }

  async getStockInAllUnits(itemId: string, tenantId: string) {
    const item = await this.findOne(itemId, tenantId);

    if (!item.isInventoriable || !item.currentStock) {
      throw new BadRequestException('Item is not inventoriable or has no stock');
    }

    const conversions = await this.getUnitConversions(itemId, tenantId);

    const stockInUnits = conversions.map((conv) => {
      const stockInUnit =
        parseFloat(item.currentStock.toString()) /
        parseFloat(conv.factor.toString());

      return {
        purpose: conv.purpose,
        unit: conv.unit,
        quantity: stockInUnit,
        isDefault: conv.isDefault,
      };
    });

    return {
      item: {
        id: item.id,
        code: item.code,
        name: item.name,
      },
      baseStock: item.currentStock,
      baseUnit: item.baseUnit,
      stockInUnits,
    };
  }
}