import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';

@Injectable()
export class SalesOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createSalesOrderDto: CreateSalesOrderDto) {
    // Verify customer exists and belongs to tenant
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: createSalesOrderDto.customerId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Verify all items exist and belong to tenant
    for (const line of createSalesOrderDto.lines) {
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

    // Generate SO number
    const soNumber = await this.generateSoNumber(tenantId);

    // Calculate totals
    let subtotal = 0;
    const linesWithTotals = createSalesOrderDto.lines.map((line, index) => {
      const discountAmount = (line.unitPrice * line.orderedQuantity * (line.discountPercent || 0)) / 100;
      const lineTotal = (line.unitPrice * line.orderedQuantity) - discountAmount;
      subtotal += lineTotal;

      return {
        lineNumber: index + 1,
        itemId: line.itemId,
        description: line.description,
        orderedQuantity: line.orderedQuantity,
        reservedQuantity: 0,
        shippedQuantity: 0,
        uom: line.uom,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent || 0,
        lineTotal,
        deliveryDate: line.deliveryDate ? new Date(line.deliveryDate) : null,
        status: 'open',
        createdBy: userId,
        updatedBy: userId,
      };
    });

    const total = subtotal; // Can add tax later

    // Create SO with lines
    const salesOrder = await this.prisma.salesOrder.create({
      data: {
        tenantId,
        soNumber,
        customerId: createSalesOrderDto.customerId,
        orderDate: new Date(),
        customerPo: createSalesOrderDto.customerPo,
        requestedDate: createSalesOrderDto.requestedDate ? new Date(createSalesOrderDto.requestedDate) : null,
        promisedDate: createSalesOrderDto.promisedDate ? new Date(createSalesOrderDto.promisedDate) : null,
        paymentTerms: createSalesOrderDto.paymentTerms,
        currency: createSalesOrderDto.currency || 'USD',
        exchangeRate: 1,
        subtotal,
        discountAmount: 0,
        taxAmount: 0,
        total,
        status: 'draft',
        notes: createSalesOrderDto.notes,
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
        customer: {
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

    return salesOrder;
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const salesOrders = await this.prisma.salesOrder.findMany({
      where,
      include: {
        customer: {
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
        orderDate: 'desc',
      },
    });

    return salesOrders;
  }

  async findOne(tenantId: string, id: string) {
    const salesOrder = await this.prisma.salesOrder.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        customer: {
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

    if (!salesOrder) {
      throw new NotFoundException(`Sales Order with ID ${id} not found`);
    }

    return salesOrder;
  }

  async update(tenantId: string, userId: string, id: string, updateSalesOrderDto: UpdateSalesOrderDto) {
    const so = await this.findOne(tenantId, id);

    if (so.status !== 'draft') {
      throw new BadRequestException('Can only update sales orders in draft status');
    }

    const salesOrder = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        ...updateSalesOrderDto,
        updatedBy: userId,
      },
      include: {
        customer: true,
        lines: {
          include: {
            item: true,
          },
        },
      },
    });

    return salesOrder;
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const so = await this.findOne(tenantId, id);

    const salesOrder = await this.prisma.salesOrder.update({
      where: { id },
      data: {
        status,
        updatedBy: userId,
      },
    });

    return {
      message: `Sales Order ${so.soNumber} ${status}`,
      salesOrder,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const so = await this.findOne(tenantId, id);

    if (so.status !== 'draft') {
      throw new BadRequestException('Can only delete sales orders in draft status');
    }

    await this.prisma.salesOrder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Sales Order deleted successfully',
      id,
    };
  }

  private async generateSoNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SO-${year}`;

    const lastSo = await this.prisma.salesOrder.findFirst({
      where: {
        tenantId,
        soNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        soNumber: 'desc',
      },
    });

    if (!lastSo) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(lastSo.soNumber.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}-${nextNumber}`;
  }
}
