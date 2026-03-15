import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BomService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createBomDto: CreateBomDto) {
    // Verify parent item exists
    const parentItem = await this.prisma.item.findFirst({
      where: {
        id: createBomDto.itemId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!parentItem) {
      throw new NotFoundException('Parent item not found');
    }

    // Verify all component items exist
    for (const component of createBomDto.components) {
      const componentItem = await this.prisma.item.findFirst({
        where: {
          id: component.componentItemId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!componentItem) {
        throw new NotFoundException(`Component item ${component.componentItemId} not found`);
      }

      // Prevent circular reference
      if (component.componentItemId === createBomDto.itemId) {
        throw new BadRequestException('Item cannot be a component of itself');
      }
    }

    // Generate BOM number
    const bomNumber = createBomDto.bomCode || await this.generateBomNumber(tenantId);

    // Check for duplicate
    const existing = await this.prisma.bom.findFirst({
      where: {
        tenantId,
        bomNumber,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`BOM with number ${bomNumber} already exists`);
    }

    // Parse version
    const versionNumber = createBomDto.version ? parseInt(createBomDto.version) : 1;

    // Create BOM with components
    const bom = await this.prisma.bom.create({
      data: {
        tenantId,
        parentItemId: createBomDto.itemId,
        bomNumber,
        version: versionNumber,
        isActive: createBomDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
        components: {
          create: createBomDto.components.map((comp, index) => ({
            tenantId,
            componentItemId: comp.componentItemId,
            lineNumber: index + 1,
            quantityPer: new Decimal(comp.quantity),
            uom: comp.uom,
            scrapPercent: new Decimal(comp.scrapPercent || 0),
            createdBy: userId,
            updatedBy: userId,
          })),
        },
      },
      include: {
        parentItem: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        components: {
          include: {
            componentItem: {
              select: {
                id: true,
                code: true,
                name: true,
                baseUom: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
    });

    return this.formatBomResponse(bom);
  }

  async findAll(tenantId: string, itemId?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (itemId) {
      where.parentItemId = itemId;
    }

    const boms = await this.prisma.bom.findMany({
      where,
      include: {
        parentItem: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            components: true,
          },
        },
      },
      orderBy: {
        bomNumber: 'asc',
      },
    });

    return boms;
  }

  async findOne(tenantId: string, id: string) {
    const bom = await this.prisma.bom.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        parentItem: {
          select: {
            id: true,
            code: true,
            name: true,
            baseUom: true,
          },
        },
        components: {
          include: {
            componentItem: {
              select: {
                id: true,
                code: true,
                name: true,
                baseUom: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
    });

    if (!bom) {
      throw new NotFoundException(`BOM with ID ${id} not found`);
    }

    return this.formatBomResponse(bom);
  }

  async update(tenantId: string, userId: string, id: string, updateBomDto: UpdateBomDto) {
    await this.findOne(tenantId, id);

    if (updateBomDto.bomCode) {
      const existing = await this.prisma.bom.findFirst({
        where: {
          tenantId,
          bomNumber: updateBomDto.bomCode,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`BOM with number ${updateBomDto.bomCode} already exists`);
      }
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (updateBomDto.bomCode) updateData.bomNumber = updateBomDto.bomCode;
    if (updateBomDto.description !== undefined) updateData.description = updateBomDto.description;
    if (updateBomDto.version) updateData.version = parseInt(updateBomDto.version);
    if (updateBomDto.isActive !== undefined) updateData.isActive = updateBomDto.isActive;
    if (updateBomDto.itemId) updateData.parentItemId = updateBomDto.itemId;

    const bom = await this.prisma.bom.update({
      where: { id },
      data: updateData,
      include: {
        parentItem: true,
        components: {
          include: {
            componentItem: true,
          },
        },
      },
    });

    return this.formatBomResponse(bom);
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.bom.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'BOM deleted successfully',
      id,
    };
  }

  async calculateMaterialRequirements(tenantId: string, id: string, quantity: number) {
    const bom = await this.findOne(tenantId, id);

    const requirements = bom.components.map(comp => {
      const requiredQty = comp.quantityPer * quantity;
      const scrapQty = (requiredQty * comp.scrapPercent) / 100;
      const totalQty = requiredQty + scrapQty;

      return {
        componentItem: comp.componentItem,
        quantityPerUnit: comp.quantityPer,
        requiredQuantity: requiredQty,
        scrapQuantity: scrapQty,
        totalQuantity: totalQty,
        uom: comp.uom,
      };
    });

    return {
      bom: {
        id: bom.id,
        bomNumber: bom.bomNumber,
        parentItem: bom.parentItem,
        version: bom.version,
      },
      productionQuantity: quantity,
      requirements,
      totalComponents: requirements.length,
    };
  }

  private async generateBomNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BOM-${year}`;

    const lastBom = await this.prisma.bom.findFirst({
      where: {
        tenantId,
        bomNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        bomNumber: 'desc',
      },
    });

    if (!lastBom) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(lastBom.bomNumber.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}-${nextNumber}`;
  }

  private formatBomResponse(bom: any) {
    return {
      ...bom,
      components: bom.components?.map(comp => ({
        ...comp,
        quantityPer: comp.quantityPer.toNumber(),
        scrapPercent: comp.scrapPercent.toNumber(),
      })),
    };
  }
}
