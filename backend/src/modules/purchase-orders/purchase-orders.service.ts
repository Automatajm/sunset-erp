import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';

// PO lifecycle state machine (spec-020) — the single status authority.
// receive() routes its partially_received/received writes through these edges too.
const PO_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partially_received', 'received', 'cancelled'],
  partially_received: ['partially_received', 'received', 'closed'],
  received: ['closed'],
  // closed / cancelled are terminal
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private stockTransactions: StockTransactionsService,
    private notifications: NotificationsService,
  ) {}

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
      const discountAmount =
        (line.unitPrice * line.orderedQuantity * (line.discountPercent || 0)) / 100;
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

    let createdPo;
    try {
      createdPo = await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          poNumber,
          supplierId: createPurchaseOrderDto.supplierId,
          poDate: new Date(),
          expectedDate: createPurchaseOrderDto.expectedDate
            ? new Date(createPurchaseOrderDto.expectedDate)
            : null,
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
            create: linesWithTotals.map((line) => ({ tenantId, ...line })),
          },
        },
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          lines: {
            include: { item: { select: { id: true, code: true, name: true } } },
          },
        },
      });
    } catch (e) {
      // @@unique([tenantId, poNumber]) can race on concurrent creates.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `Purchase order number ${poNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }

    // spec-022 — fire-and-forget: notify the supplier the PO was issued.
    if (supplier.email) {
      this.notifications.safeQueue(
        tenantId,
        'po_created',
        { email: supplier.email, name: supplier.name },
        {
          poNumber,
          supplierName: supplier.name,
          total: Number(createdPo.total),
          currency: createdPo.currency ?? '',
        },
        { createdBy: userId },
      );
    }

    return createdPo;
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { poDate: 'desc' },
    });

    return { purchaseOrders, count: purchaseOrders.length };
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

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ) {
    const po = await this.findOne(tenantId, id);
    if (po.status !== 'draft') {
      throw new BadRequestException('Can only update purchase orders in draft status');
    }

    // Tenant-scoped at the write itself, then re-fetch for the joined response.
    await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...updatePurchaseOrderDto, updatedBy: userId },
    });

    return this.findOne(tenantId, id);
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const po = await this.findOne(tenantId, id);

    const allowed = PO_TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${po.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { status, updatedBy: userId },
    });

    return {
      message: `Purchase Order ${po.poNumber} → ${status}`,
      purchaseOrder: await this.findOne(tenantId, id),
    };
  }

  async receive(tenantId: string, userId: string, id: string, dto: ReceivePurchaseOrderDto) {
    const po = await this.findOne(tenantId, id);

    if (!['confirmed', 'partially_received'].includes(po.status)) {
      throw new BadRequestException(
        'Can only receive confirmed or partially received purchase orders',
      );
    }

    // Verify warehouse
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    // Pre-validate every line (membership + over-receive) before any write.
    for (const recv of dto.lines) {
      if (recv.receivedQuantity <= 0) continue;
      const line = (po.lines as any[]).find((l) => l.id === recv.lineId);
      if (!line) throw new NotFoundException(`PO Line ${recv.lineId} not found`);
      const remaining = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      if (recv.receivedQuantity > remaining) {
        throw new BadRequestException(
          `Cannot receive ${recv.receivedQuantity} for line ${line.lineNumber}. Remaining: ${remaining}`,
        );
      }
    }

    // Atomic: line updates + stock + movements + PO status commit together.
    // Movement numbers come from the shared spec-017 generator (tx-aware so the
    // per-line generations see their own uncommitted movements).
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const recv of dto.lines) {
          if (recv.receivedQuantity <= 0) continue;
          const line = (po.lines as any[]).find((l) => l.id === recv.lineId);

          const unitCost = recv.unitCost ?? Number(line.unitPrice);
          const newReceived = Number(line.receivedQuantity) + recv.receivedQuantity;
          const lineFullyClosed = newReceived >= Number(line.orderedQuantity);

          await tx.purchaseOrderLine.updateMany({
            where: { id: recv.lineId, tenantId, deletedAt: null },
            data: {
              receivedQuantity: { increment: recv.receivedQuantity },
              status: lineFullyClosed ? 'closed' : 'open',
              updatedBy: userId,
            },
          });

          // Find-or-create stock record (Stock is owned by stock-transactions —
          // direct write is a documented spec-020 exception, tenant-scoped here).
          const existingStock = await tx.stock.findFirst({
            where: {
              tenantId,
              itemId: line.itemId,
              warehouseId: dto.warehouseId,
              lotNumber: recv.lotNumber ?? null,
              serialNumber: null,
            },
          });

          if (existingStock) {
            await tx.stock.updateMany({
              where: { id: existingStock.id, tenantId },
              data: {
                onHandQuantity: { increment: recv.receivedQuantity },
                unitCost,
              },
            });
          } else {
            await tx.stock.create({
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

          const movNumber = await this.stockTransactions.generateMovementNumber(tenantId, tx);
          await tx.stockMovement.create({
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

        // Re-fetch lines to determine the new PO status, then route it through
        // the state machine — receive is no longer a second status authority.
        const updatedLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: id, tenantId, deletedAt: null },
        });

        const allClosed =
          updatedLines.length > 0 && updatedLines.every((l) => l.status === 'closed');
        const anyReceived = updatedLines.some((l) => Number(l.receivedQuantity) > 0);
        const newStatus = allClosed ? 'received' : anyReceived ? 'partially_received' : po.status;

        if (newStatus !== po.status) {
          const allowed = PO_TRANSITIONS[po.status] ?? [];
          if (!allowed.includes(newStatus)) {
            throw new BadRequestException(
              `Receive would transition '${po.status}' to '${newStatus}', which is not allowed`,
            );
          }
        }

        await tx.purchaseOrder.updateMany({
          where: { id, tenantId, deletedAt: null },
          data: { status: newStatus, updatedBy: userId },
        });
      });
    } catch (e) {
      // Movement-number unique can race with concurrent receipts.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          'A movement number was just taken by a concurrent request. Please retry the receive.',
        );
      }
      throw e;
    }

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const po = await this.findOne(tenantId, id);
    if (po.status !== 'draft') {
      throw new BadRequestException('Can only delete purchase orders in draft status');
    }

    await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Purchase Order deleted successfully', id };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  // Public shared API (spec-020): RfqsService injects this for award-generated POs.
  // Numeric max over findMany (lexicographic findFirst breaks past mixed widths);
  // deliberately spans soft-deleted rows so numbers are never reused (spec-012).
  async generatePoNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const prefix = `PO-${year}`;
    const existing = await db.purchaseOrder.findMany({
      where: { tenantId, poNumber: { startsWith: prefix } },
      select: { poNumber: true },
    });
    const max = existing.reduce((m, r) => {
      const n = parseInt(r.poNumber.split('-')[2], 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
  }
}
