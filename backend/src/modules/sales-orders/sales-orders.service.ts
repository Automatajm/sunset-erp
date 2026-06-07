import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';

// SO lifecycle state machine (spec-019). 'confirmed' and 'shipped' are
// load-bearing for spec-016's planning ATP — keep the exact strings.
const SO_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['closed'],
  // closed / cancelled are terminal
};

@Injectable()
export class SalesOrdersService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

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
      const discountAmount =
        (line.unitPrice * line.orderedQuantity * (line.discountPercent || 0)) / 100;
      const lineTotal = line.unitPrice * line.orderedQuantity - discountAmount;
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

    // Create SO with lines. @@unique([tenantId, soNumber]) can race on
    // concurrent creates — surface that as 409, never a 500.
    let salesOrder;
    try {
      salesOrder = await this.prisma.salesOrder.create({
        data: {
          tenantId,
          soNumber,
          customerId: createSalesOrderDto.customerId,
          orderDate: new Date(),
          customerPo: createSalesOrderDto.customerPo,
          requestedDate: createSalesOrderDto.requestedDate
            ? new Date(createSalesOrderDto.requestedDate)
            : null,
          promisedDate: createSalesOrderDto.promisedDate
            ? new Date(createSalesOrderDto.promisedDate)
            : null,
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
            create: linesWithTotals.map((line) => ({
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
            where: { deletedAt: null },
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
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `Sales order number ${soNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }

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

    return { salesOrders, count: salesOrders.length };
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
          where: { deletedAt: null },
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

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateSalesOrderDto: UpdateSalesOrderDto,
  ) {
    const so = await this.findOne(tenantId, id);

    if (so.status !== 'draft') {
      throw new BadRequestException('Can only update sales orders in draft status');
    }

    // A changed customerId must point at an in-tenant, non-deleted customer —
    // the FK alone is global (spec-018 precedent).
    if (updateSalesOrderDto.customerId && updateSalesOrderDto.customerId !== so.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: updateSalesOrderDto.customerId, tenantId, deletedAt: null },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    // Tenant-scoped at the write itself, then re-fetch for the joined response.
    await this.prisma.salesOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...updateSalesOrderDto,
        updatedBy: userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const so = await this.findOne(tenantId, id);

    const allowed = SO_TRANSITIONS[so.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${so.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    await this.prisma.salesOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status,
        updatedBy: userId,
      },
    });

    const updated = await this.findOne(tenantId, id);

    // spec-022 — fire-and-forget: notify the customer on confirmation.
    if (status === 'confirmed' && (updated as any).customer?.email) {
      this.notifications.safeQueue(
        tenantId,
        'so_confirmed',
        { email: (updated as any).customer.email, name: (updated as any).customer.name },
        {
          soNumber: updated.soNumber,
          customerName: (updated as any).customer.name,
          total: (updated as any).total,
          currency: (updated as any).currency ?? '',
        },
        { createdBy: userId },
      );
    }

    return {
      message: `Sales Order ${so.soNumber} ${status}`,
      salesOrder: updated,
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const so = await this.findOne(tenantId, id);

    if (so.status !== 'draft') {
      throw new BadRequestException('Can only delete sales orders in draft status');
    }

    await this.prisma.salesOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
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
