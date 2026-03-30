import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

@Injectable()
export class PurchaseOrdersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createPurchaseOrderDto: CreatePurchaseOrderDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: createPurchaseOrderDto.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    for (const line of createPurchaseOrderDto.lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
    }

    const poNumber = await this.generatePoNumber(tenantId);

    let subtotal = 0;
    const linesWithTotals = createPurchaseOrderDto.lines.map((line, index) => {
      const discountAmount = (line.unitPrice * line.orderedQuantity * (line.discountPercent || 0)) / 100;
      const lineTotal = line.unitPrice * line.orderedQuantity - discountAmount;
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
        total: subtotal,
        status: 'draft',
        notes: createPurchaseOrderDto.notes,
        createdBy: userId,
        updatedBy: userId,
        lines: {
          create: linesWithTotals.map(line => ({ tenantId, ...line })),
        },
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        lines: {
          include: { item: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    return purchaseOrder;
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { poDate: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        supplier: { select: { id: true, code: true, name: true, email: true, phone: true } },
        lines: {
          where: { deletedAt: null },
          include: {
            item: { select: { id: true, code: true, name: true, baseUom: true } },
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!purchaseOrder) throw new NotFoundException(`Purchase Order with ID ${id} not found`);
    return purchaseOrder;
  }

  async update(tenantId: string, userId: string, id: string, updatePurchaseOrderDto: UpdatePurchaseOrderDto) {
    const po = await this.findOne(tenantId, id);
    if (po.status !== 'draft') {
      throw new BadRequestException('Can only update purchase orders in draft status');
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { ...updatePurchaseOrderDto, updatedBy: userId },
      include: {
        supplier: true,
        lines: { include: { item: true } },
      },
    });
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const po = await this.findOne(tenantId, id);

    // State machine validation
    const validTransitions: Record<string, string[]> = {
      draft:              ['confirmed', 'cancelled'],
      confirmed:          ['cancelled'],
      partially_received: ['received', 'closed'],
      received:           ['closed'],
    };

    const allowed = validTransitions[po.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${po.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const purchaseOrder = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status, updatedBy: userId },
    });

    return {
      message: `Purchase Order ${po.poNumber} → ${status}`,
      purchaseOrder,
    };
  }

  async receive(tenantId: string, userId: string, id: string, dto: ReceivePurchaseOrderDto) {
    const po = await this.findOne(tenantId, id);

    if (!['confirmed', 'partially_received'].includes(po.status)) {
      throw new BadRequestException('Can only receive confirmed or partially received purchase orders');
    }

    // Verify warehouse
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    // Process each line (movement number generated per line)
    for (const recv of dto.lines) {
      if (recv.receivedQuantity <= 0) continue;

      const line = (po.lines as any[]).find(l => l.id === recv.lineId);
      if (!line) throw new NotFoundException(`PO Line ${recv.lineId} not found`);

      const remaining = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      if (recv.receivedQuantity > remaining) {
        throw new BadRequestException(
          `Cannot receive ${recv.receivedQuantity} for line ${line.lineNumber}. Remaining: ${remaining}`,
        );
      }

      const unitCost = recv.unitCost ?? Number(line.unitPrice);
      const newReceived = Number(line.receivedQuantity) + recv.receivedQuantity;
      const lineFullyClosed = newReceived >= Number(line.orderedQuantity);

      // Update PO line received quantity
      await this.prisma.purchaseOrderLine.update({
        where: { id: recv.lineId },
        data: {
          receivedQuantity: { increment: recv.receivedQuantity },
          status: lineFullyClosed ? 'closed' : 'open',
          updatedBy: userId,
        },
      });

      // Find-or-create stock record (avoids Prisma null constraint issue in unique where)
      const existingStock = await this.prisma.stock.findFirst({
        where: {
          tenantId,
          itemId: line.itemId,
          warehouseId: dto.warehouseId,
          lotNumber: recv.lotNumber ?? null,
          serialNumber: null,
        },
      });

      if (existingStock) {
        await this.prisma.stock.update({
          where: { id: existingStock.id },
          data: {
            onHandQuantity: { increment: recv.receivedQuantity },
            unitCost,
          },
        });
      } else {
        await this.prisma.stock.create({
          data: {
            tenantId,
            itemId: line.itemId,
            warehouseId: dto.warehouseId,
            onHandQuantity: recv.receivedQuantity,
            reservedQuantity: 0,
            unitCost,
            lotNumber: recv.lotNumber ?? null,
            serialNumber: null,
          },
        });
      }

      // Create stock movement record — unique number per line
      const movNumber = await this.generateMovNumber(tenantId);
      await this.prisma.stockMovement.create({
        data: {
          tenantId,
          movementNumber: movNumber,
          movementType: 'receipt',
          movementDate: new Date(),
          itemId: line.itemId,
          toWarehouseId: dto.warehouseId,
          quantity: recv.receivedQuantity,
          uom: line.uom,
          unitCost,
          referenceType: 'purchase_order',
          referenceId: po.id,
          lotNumber: recv.lotNumber ?? null,
          notes: dto.notes,
          createdBy: userId,
        },
      });
    }

    // Re-fetch lines to determine new PO status
    const updatedLines = await this.prisma.purchaseOrderLine.findMany({
      where: { purchaseOrderId: id, deletedAt: null },
    });

    const allClosed  = updatedLines.every(l => l.status === 'closed');
    const anyReceived = updatedLines.some(l => Number(l.receivedQuantity) > 0);

    const newStatus = allClosed    ? 'received'
      : anyReceived ? 'partially_received'
      : po.status;

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: newStatus, updatedBy: userId },
    });

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const po = await this.findOne(tenantId, id);
    if (po.status !== 'draft') {
      throw new BadRequestException('Can only delete purchase orders in draft status');
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Purchase Order deleted successfully', id };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async generatePoNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    const next = last
      ? (parseInt(last.poNumber.split('-')[2]) + 1).toString().padStart(4, '0')
      : '0001';
    return `${prefix}-${next}`;
  }

  private async generateMovNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SM-${year}`;
    const last = await this.prisma.stockMovement.findFirst({
      where: { tenantId, movementNumber: { startsWith: prefix } },
      orderBy: { movementNumber: 'desc' },
    });
    const next = last
      ? (parseInt(last.movementNumber.split('-')[2]) + 1).toString().padStart(4, '0')
      : '0001';
    return `${prefix}-${next}`;
  }
}