import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductionOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createProductionOrderDto: CreateProductionOrderDto) {
    // Verify BOM exists
    const bom = await this.prisma.bom.findFirst({
      where: {
        id: createProductionOrderDto.bomId,
        tenantId,
        deletedAt: null,
      },
      include: {
        parentItem: true,
        components: {
          include: {
            componentItem: true,
          },
        },
      },
    });

    if (!bom) {
      throw new NotFoundException('BOM not found');
    }

    // Verify work center if provided
    if (createProductionOrderDto.workCenterId) {
      const workCenter = await this.prisma.workCenter.findFirst({
        where: {
          id: createProductionOrderDto.workCenterId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!workCenter) {
        throw new NotFoundException('Work center not found');
      }
    }

    // Generate PO number
    const poNumber = await this.generatePoNumber(tenantId);

    // Create production order
    const productionOrder = await this.prisma.productionOrder.create({
      data: {
        tenantId,
        poNumber,
        bomId: createProductionOrderDto.bomId,
        itemId: bom.parentItemId,
        quantityToProduce: new Decimal(createProductionOrderDto.quantityOrdered),
        quantityProduced: new Decimal(0),
        plannedStartDate: createProductionOrderDto.plannedStartDate 
          ? new Date(createProductionOrderDto.plannedStartDate) 
          : null,
        plannedEndDate: createProductionOrderDto.plannedEndDate 
          ? new Date(createProductionOrderDto.plannedEndDate) 
          : null,
        status: 'draft',
        notes: createProductionOrderDto.notes,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return this.formatProductionOrderResponse(productionOrder, bom);
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const orders = await this.prisma.productionOrder.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return orders.map(order => this.formatProductionOrderResponse(order));
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!order) {
      throw new NotFoundException(`Production order with ID ${id} not found`);
    }

    // Get BOM details if exists
    let bom = null;
    if (order.bomId) {
      bom = await this.prisma.bom.findFirst({
        where: { id: order.bomId },
        include: {
          parentItem: true,
          components: {
            include: {
              componentItem: true,
            },
          },
        },
      });
    }

    return this.formatProductionOrderResponse(order, bom);
  }

  async update(tenantId: string, userId: string, id: string, updateProductionOrderDto: UpdateProductionOrderDto) {
    const order = await this.findOne(tenantId, id);

    if (order.status !== 'draft') {
      throw new BadRequestException('Can only update production orders in draft status');
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (updateProductionOrderDto.quantityOrdered !== undefined) 
      updateData.quantityToProduce = new Decimal(updateProductionOrderDto.quantityOrdered);
    if (updateProductionOrderDto.plannedStartDate) 
      updateData.plannedStartDate = new Date(updateProductionOrderDto.plannedStartDate);
    if (updateProductionOrderDto.plannedEndDate) 
      updateData.plannedEndDate = new Date(updateProductionOrderDto.plannedEndDate);
    if (updateProductionOrderDto.notes !== undefined) 
      updateData.notes = updateProductionOrderDto.notes;

    const updated = await this.prisma.productionOrder.update({
      where: { id },
      data: updateData,
    });

    return this.formatProductionOrderResponse(updated);
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const order = await this.findOne(tenantId, id);

    const updated = await this.prisma.productionOrder.update({
      where: { id },
      data: {
        status,
        actualStartDate: status === 'in_progress' && !order.actualStartDate ? new Date() : order.actualStartDate,
        actualEndDate: status === 'completed' ? new Date() : order.actualEndDate,
        updatedBy: userId,
      },
    });

    return {
      message: `Production order ${order.poNumber} status updated to ${status}`,
      productionOrder: this.formatProductionOrderResponse(updated),
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const order = await this.findOne(tenantId, id);

    if (order.status !== 'draft') {
      throw new BadRequestException('Can only delete production orders in draft status');
    }

    await this.prisma.productionOrder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Production order deleted successfully',
      id,
    };
  }

  private async generatePoNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MO-${year}`;

    const lastPo = await this.prisma.productionOrder.findFirst({
      where: {
        tenantId,
        poNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        poNumber: 'desc',
      },
    });

    if (!lastPo) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(lastPo.poNumber.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}-${nextNumber}`;
  }

  private formatProductionOrderResponse(order: any, bom?: any) {
    return {
      ...order,
      quantityToProduce: order.quantityToProduce.toNumber(),
      quantityProduced: order.quantityProduced.toNumber(),
      bom: bom ? {
        ...bom,
        components: bom.components?.map(comp => ({
          ...comp,
          quantityPer: comp.quantityPer.toNumber(),
          scrapPercent: comp.scrapPercent.toNumber(),
        })),
      } : undefined,
    };
  }
}
