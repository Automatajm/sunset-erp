// ============================================================================
// FILE: backend/src/modules/goods-receipts/goods-receipts.service.ts
// ============================================================================
import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';

@Injectable()
export class GoodsReceiptsService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate GRN number ──────────────────────────────────────────────
  // Pattern: GRN-{YYYY}-{NNNN}  e.g. GRN-2026-0001

  private async generateGrnNumber(tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `GRN-${year}`;
    const last   = await this.prisma.goodsReceipt.findFirst({
      where:   { tenantId, grnNumber: { startsWith: prefix } },
      orderBy: { grnNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts  = last.grnNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Auto-generate movement number ───────────────────────────────────────────
  // Pattern: MOV-{YYYY}-{NNNN}  e.g. MOV-2026-0001

  private async generateMovementNumber(tx: any, tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `MOV-${year}`;
    const last   = await tx.stockMovement.findFirst({
      where:   { tenantId, movementNumber: { startsWith: prefix } },
      orderBy: { movementNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts   = last.movementNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateGoodsReceiptDto) {
    // Validate warehouse exists
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException(`Warehouse ${dto.warehouseId} not found`);

    // Validate PO if provided
    if (dto.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.poId, tenantId, deletedAt: null },
      });
      if (!po) throw new NotFoundException(`Purchase order ${dto.poId} not found`);
      if (po.status === 'cancelled') throw new BadRequestException('Cannot receive against a cancelled PO');
    }

    // Validate all items exist
    for (const line of dto.lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

      if (line.poLineId) {
        const poLine = await this.prisma.purchaseOrderLine.findFirst({
          where: { id: line.poLineId, deletedAt: null },
        });
        if (!poLine) throw new NotFoundException(`PO line ${line.poLineId} not found`);
      }
    }

    const grnNumber = await this.generateGrnNumber(tenantId);

    // Create GRN + lines + stock movements in a transaction
    const grn = await this.prisma.$transaction(async (tx) => {
      // 1. Create GRN header
      const grn = await tx.goodsReceipt.create({
        data: {
          tenantId,
          grnNumber,
          poId:         dto.poId ?? null,
          warehouseId:  dto.warehouseId,
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
          status:       'posted',
          condition:    dto.condition ?? 'complete',
          notes:        dto.notes ?? null,
          createdBy:    userId,
          updatedBy:    userId,
        },
      });

      // 2. Create lines + stock movements
      let lineNumber = 1;
      for (const line of dto.lines) {
        // Create stock movement (IN)
        const movementNumber = await this.generateMovementNumber(tx, tenantId);
        const movement = await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber,
            movementType:    'receipt',
            itemId:          line.itemId,
            fromWarehouseId: null,
            toWarehouseId:   dto.warehouseId,
            quantity:        line.receivedQuantity,
            uom:             line.uom,
            unitCost:        line.unitCost ?? null,
            lotNumber:       line.lotNumber ?? null,
            referenceType:   'GRN',
            referenceId:     grn.id,
            notes:           line.notes ?? null,
            createdBy:       userId,
          },
        });

        // Create GRN line
        await tx.goodsReceiptLine.create({
          data: {
            tenantId,
            grnId:           grn.id,
            lineNumber:      lineNumber++,
            poLineId:        line.poLineId ?? null,
            itemId:          line.itemId,
            warehouseId:     dto.warehouseId,
            stockMovementId: movement.id,
            receivedQuantity: line.receivedQuantity,
            uom:             line.uom,
            unitCost:        line.unitCost ?? null,
            lotNumber:       line.lotNumber ?? null,
            notes:           line.notes ?? null,
            createdBy:       userId,
            updatedBy:       userId,
          },
        });

        // 3. Upsert stock record
        const existingStock = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId, warehouseId: dto.warehouseId },
        });

        if (existingStock) {
          await tx.stock.update({
            where: { id: existingStock.id },
            data: {
              onHandQuantity: { increment: line.receivedQuantity },
              unitCost:       line.unitCost ?? existingStock.unitCost,
            },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId,
              itemId:          line.itemId,
              warehouseId:     dto.warehouseId,
              onHandQuantity:  line.receivedQuantity,
              reservedQuantity: 0,
              unitCost:        line.unitCost ?? null,
            },
          });
        }

        // 4. Update PO line received quantity if linked
        if (line.poLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data: { receivedQuantity: { increment: line.receivedQuantity } },
          });
        }
      }

      // 5. Update PO status if all lines fully received
      if (dto.poId) {
        const poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: dto.poId, deletedAt: null },
        });
        const allReceived = poLines.every(
          l => Number(l.receivedQuantity) >= Number(l.orderedQuantity)
        );
        const anyReceived = poLines.some(l => Number(l.receivedQuantity) > 0);
        const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : 'approved';
        await tx.purchaseOrder.update({
          where: { id: dto.poId },
          data:  { status: newStatus, updatedBy: userId },
        });
      }

      return grn;
    });

    return this.findOne(tenantId, grn.id);
  }

  // ── Find All ──────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const grns = await this.prisma.goodsReceipt.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        purchaseOrder: { select: { poNumber: true, supplier: { select: { name: true, code: true } } } },
        warehouse:     { select: { code: true, name: true } },
        lines:         { where: { deletedAt: null }, include: { item: { select: { code: true, name: true } } } },
        _count:        { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return grns.map(g => ({
      ...g,
      lineCount:      g._count.lines,
      totalValue:     g.lines.reduce((sum, l) => sum + (Number(l.receivedQuantity) * Number(l.unitCost ?? 0)), 0),
      supplierName:   g.purchaseOrder?.supplier?.name ?? null,
      supplierCode:   g.purchaseOrder?.supplier?.code ?? null,
      poNumber:       g.purchaseOrder?.poNumber ?? null,
      warehouseCode:  g.warehouse.code,
      warehouseName:  g.warehouse.name,
    }));
  }

  // ── Find One ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        purchaseOrder: {
          select: {
            poNumber: true, status: true, total: true,
            supplier: { select: { name: true, code: true } },
          },
        },
        warehouse: { select: { code: true, name: true } },
        lines: {
          where:   { deletedAt: null },
          orderBy: { lineNumber: 'asc' },
          include: {
            item:             { select: { code: true, name: true, baseUom: true } },
            purchaseOrderLine: { select: { orderedQuantity: true, unitPrice: true } },
            stockMovement:    { select: { id: true, movementType: true } },
          },
        },
      },
    });
    if (!grn) throw new NotFoundException(`GRN ${id} not found`);
    return grn;
  }

  // ── Find by PO ────────────────────────────────────────────────────────────

  async findByPo(tenantId: string, poId: string) {
    return this.prisma.goodsReceipt.findMany({
      where: { tenantId, poId, deletedAt: null },
      include: {
        warehouse: { select: { code: true, name: true } },
        lines:     { where: { deletedAt: null }, include: { item: { select: { code: true, name: true } } } },
        _count:    { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateGoodsReceiptDto) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new BadRequestException('Cannot update a cancelled GRN');

    return this.prisma.goodsReceipt.update({
      where: { id },
      data:  { ...dto, updatedBy: userId },
    });
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async cancel(tenantId: string, userId: string, id: string) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new ConflictException('GRN is already cancelled');

    await this.prisma.$transaction(async (tx) => {
      // 1. Cancel GRN
      await tx.goodsReceipt.update({
        where: { id },
        data:  { status: 'cancelled', updatedBy: userId },
      });

      // 2. Reverse stock for each line
      for (const line of grn.lines) {
        // Reverse stock movement
        const reversalNumber = await this.generateMovementNumber(tx, tenantId);
        await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber:  reversalNumber,
            movementType:    'adjustment',
            itemId:          line.itemId,
            fromWarehouseId: grn.warehouseId,
            toWarehouseId:   null,
            quantity:        -Number(line.receivedQuantity),
            uom:             line.uom,
            unitCost:        line.unitCost ?? null,
            referenceType:   'GRN_CANCEL',
            referenceId:     id,
            notes:           `Reversal of GRN ${grn.grnNumber}`,
            createdBy:       userId,
          },
        });

        // Reduce stock on hand
        const stock = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId, warehouseId: grn.warehouseId },
        });
        if (stock) {
          await tx.stock.update({
            where: { id: stock.id },
            data:  { onHandQuantity: { decrement: Number(line.receivedQuantity) } },
          });
        }

        // Reverse PO line received quantity
        if (line.poLineId) {
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data:  { receivedQuantity: { decrement: Number(line.receivedQuantity) } },
          });
        }
      }

      // 3. Update PO status back if linked
      if (grn.poId) {
        const poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: grn.poId, deletedAt: null },
        });
        const anyReceived = poLines.some(l => Number(l.receivedQuantity) > 0);
        await tx.purchaseOrder.update({
          where: { id: grn.poId },
          data:  { status: anyReceived ? 'partial' : 'approved', updatedBy: userId },
        });
      }
    });

    return { message: `GRN ${grn.grnNumber} cancelled successfully`, id };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [total, posted, cancelled, today] = await Promise.all([
      this.prisma.goodsReceipt.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.goodsReceipt.count({ where: { tenantId, status: 'posted', deletedAt: null } }),
      this.prisma.goodsReceipt.count({ where: { tenantId, status: 'cancelled', deletedAt: null } }),
      this.prisma.goodsReceipt.count({
        where: {
          tenantId, deletedAt: null,
          receivedDate: {
            gte: new Date(new Date().setHours(0,0,0,0)),
            lte: new Date(new Date().setHours(23,59,59,999)),
          },
        },
      }),
    ]);

    const valueAgg = await this.prisma.$queryRaw<{ total_value: number }[]>`
      SELECT COALESCE(SUM(l.received_quantity * COALESCE(l.unit_cost, 0)), 0)::float AS total_value
      FROM grn_receipt_lines l
      JOIN grn_receipts g ON g.id = l.grn_id
      WHERE g.tenant_id = ${tenantId}::uuid
        AND g.status = 'posted'
        AND g.deleted_at IS NULL
        AND l.deleted_at IS NULL
    `;

    return {
      total, posted, cancelled, today,
      totalValue: valueAgg[0]?.total_value ?? 0,
    };
  }
}