import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createPurchaseOrderDto: CreatePurchaseOrderDto) {
    // Verify supplier exists and belongs to tenant
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: createPurchaseOrderDto.supplierId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    // Verify all items exist and belong to tenant
    for (const line of createPurchaseOrderDto.lines) {
      const item = await this.prisma.item.findFirst({
        where: {
          id: line.itemId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!item) {
        throw new NotFoundException(`Item ${line.itemId} not found`);
      }
    }

    // Generate PO number
    const poNumber = await this.generatePoNumber(tenantId);

    // Calculate totals
    let subtotal = 0;
    const linesWithTotals = createPurchaseOrderDto.lines.map((line, index) => {
      const discountAmount = (line.unitPrice * line.orderedQuantity * (line.discountPercent || 0)) / 100;
      const lineTotal = (line.unitPrice * line.orderedQuantity) - discountAmount;
      subtotal += lineTotal;

      return {
        lineNumber: index + 1,
        itemId: line.itemId,
        description: line.description,
        orderedQuantity: line.orderedQuantity,
        receivedQuantity: 0,
        uom: line.uom,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent || 0,
        lineTotal,
        expectedDate: line.expectedDate ? new Date(line.expectedDate) : null,
        status: 'open',
        createdBy: userId,
        updatedBy: userId,
      };
    });

    const total = subtotal; // Can add tax later

    // Create PO with lines
    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        poNumber,
        supplierId: createPurchaseOrderDto.supplierId,
        poDate: new Date(),
        expectedDate: createPurchaseOrderDto.expectedDate ? new Date(createPurchaseOrderDto.expectedDate) : null,
        deliveryAddress: createPurchaseOrderDto.deliveryAddress,
        paymentTerms: createPurchaseOrderDto.paymentTerms,
        currency: createPurchaseOrderDto.currency || 'USD',
        exchangeRate: 1,
        subtotal,
        discountAmount: 0,
        taxAmount: 0,
        total,
        status: 'draft',
        notes: createPurchaseOrderDto.notes,
        createdBy: userId,
        updatedBy: userId,
        lines: {
          create: linesWithTotals.map(line => ({
            tenantId,
            ...line,
          })),
        },
      },
      include: {
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        lines: {
          include: {
            item: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return purchaseOrder;
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            lines: true,
          },
        },
      },
      orderBy: {
        poDate: 'desc',
      },
    });

    return purchaseOrders;
  }

  async findOne(tenantId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        supplier: {
          select: {
            id: true,
            code: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        lines: {
          include: {
            item: {
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

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase Order with ID ${id} not found`);
    }

    return purchaseOrder;
  }

  async update(tenantId: string, userId: string, id: string, updatePurchaseOrderDto: UpdatePurchaseOrderDto) {
    // Verify PO exists and is in draft status
    const po = await this.findOne(tenantId, id);

    if (po.status !== 'draft') {
      throw new BadRequestException('Can only update purchase orders in draft status');
    }

    const purchaseOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...updatePurchaseOrderDto,
        updatedBy: userId,
      },
      include: {
        supplier: true,
        lines: {
          include: {
            item: true,
          },
        },
      },
    });

    return purchaseOrder;
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const po = await this.findOne(tenantId, id);

    const purchaseOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status,
        updatedBy: userId,
      },
    });

    return {
      message: `Purchase Order ${po.poNumber} ${status}`,
      purchaseOrder,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const po = await this.findOne(tenantId, id);

    if (po.status !== 'draft') {
      throw new BadRequestException('Can only delete purchase orders in draft status');
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Purchase Order deleted successfully',
      id,
    };
  }

  private async generatePoNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}`;

    const lastPo = await this.prisma.purchaseOrder.findFirst({
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
}
