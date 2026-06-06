// ============================================================================
// FILE: backend/src/modules/goods-receipts/goods-receipts.service.ts
// ============================================================================
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private prisma: PrismaService,
    private uom: UomService,
  ) {}

  // ── Auto-generate GRN number ───────────────────────────────────────────────

  private async generateGrnNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}`;
    // Numeric max — string orderBy breaks past -9999. Deliberately spans
    // soft-deleted rows (spec-012 exception).
    const rows = await this.prisma.goodsReceipt.findMany({
      where: { tenantId, grnNumber: { startsWith: prefix } },
      select: { grnNumber: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.grnNumber.split('-').pop() ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
  }

  // ── Auto-generate movement number ─────────────────────────────────────────

  private async generateMovementNumber(tx: any, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MOV-${year}`;
    // Numeric max — same pattern as generateGrnNumber.
    const rows = await tx.stockMovement.findMany({
      where: { tenantId, movementNumber: { startsWith: prefix } },
      select: { movementNumber: true },
    });
    const max = rows.reduce((m: number, r: { movementNumber: string }) => {
      const n = parseInt(r.movementNumber.split('-').pop() ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
  }

  // ── Resolve supplierId: from DTO, or from PO ───────────────────────────────

  private async resolveSupplierID(
    dto: CreateGoodsReceiptDto,
    tenantId: string,
  ): Promise<string | null> {
    if (dto.supplierId) return dto.supplierId;
    if (dto.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.poId, tenantId, deletedAt: null },
        select: { supplierId: true },
      });
      return po?.supplierId ?? null;
    }
    return null;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateGoodsReceiptDto) {
    // Validate warehouse
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
      if (po.status === 'cancelled')
        throw new BadRequestException('Cannot receive against a cancelled PO');
    }

    // Resolve supplierId (from DTO for manual, from PO for PO-linked)
    const supplierId = await this.resolveSupplierID(dto, tenantId);

    // Validate items + pre-calculate UOM quantities for each line
    const lineData: Array<{
      purchaseQty: number;
      purchaseUom: string;
      storageQty: number;
      storageUom: string;
      consumptionQty: number;
      consumptionUom: string;
    }> = [];

    // Cumulative incoming purchase qty per PO line (a GRN may repeat a poLineId)
    const incomingByPoLine = new Map<string, number>();

    for (const line of dto.lines) {
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

      let poLine: { purchaseOrderId: string; orderedQuantity: any; receivedQuantity: any } | null =
        null;
      if (line.poLineId) {
        if (!dto.poId)
          throw new BadRequestException(
            `Line with PO line ${line.poLineId} requires poId on the GRN header`,
          );
        poLine = await this.prisma.purchaseOrderLine.findFirst({
          where: { id: line.poLineId, tenantId, deletedAt: null },
        });
        if (!poLine) throw new NotFoundException(`PO line ${line.poLineId} not found`);
        if (poLine.purchaseOrderId !== dto.poId)
          throw new BadRequestException(
            `PO line ${line.poLineId} does not belong to PO ${dto.poId}`,
          );
      }

      // Find SupplierItem for conversion factor
      let supplierItemId: string | undefined;
      const resolvedSupplierId = supplierId;
      if (resolvedSupplierId) {
        const si = await this.prisma.supplierItem.findFirst({
          where: { tenantId, supplierId: resolvedSupplierId, itemId: line.itemId, deletedAt: null },
        });
        supplierItemId = si?.id;
      }

      const allQties = await this.uom.calcAllQties(
        Number(line.receivedQuantity),
        line.itemId,
        tenantId,
        supplierItemId,
      );

      // Over-receipt guard — hard block, no tolerance (spec-023 policy)
      if (poLine && line.poLineId) {
        const incoming = (incomingByPoLine.get(line.poLineId) ?? 0) + allQties.purchaseQty;
        const ordered = Number(poLine.orderedQuantity);
        const alreadyReceived = Number(poLine.receivedQuantity);
        if (alreadyReceived + incoming > ordered)
          throw new BadRequestException(
            `Over-receipt on PO line ${line.poLineId}: ordered ${ordered}, ` +
              `already received ${alreadyReceived}, remaining ${ordered - alreadyReceived}, ` +
              `attempted ${incoming}`,
          );
        incomingByPoLine.set(line.poLineId, incoming);
      }

      lineData.push(allQties);
    }

    const grnNumber = await this.generateGrnNumber(tenantId);

    let grn: { id: string };
    try {
      grn = await this.prisma.$transaction(async (tx) => {
        // 1. Create GRN header
        const grn = await tx.goodsReceipt.create({
          data: {
            tenantId,
            grnNumber,
            poId: dto.poId ?? null,
            supplierId: supplierId ?? null,
            warehouseId: dto.warehouseId,
            receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
            status: 'posted',
            condition: dto.condition ?? 'complete',
            notes: dto.notes ?? null,
            supplierRef: dto.supplierRef ?? null,
            createdBy: userId,
            updatedBy: userId,
          },
        });

        // 2. Create lines + stock movements
        let lineNumber = 1;
        for (let i = 0; i < dto.lines.length; i++) {
          const line = dto.lines[i];
          const allQtys = lineData[i];
          const unitCost = line.unitCost ? Number(line.unitCost) : null;

          const movementNumber = await this.generateMovementNumber(tx, tenantId);

          const currentStock = await tx.stock.findFirst({
            where: { tenantId, itemId: line.itemId, warehouseId: dto.warehouseId },
          });
          const currentWAC = currentStock?.unitCost ? Number(currentStock.unitCost) : 0;

          const incomingCost = unitCost ?? currentWAC;
          const wacResult = this.uom.calcNewWAC(
            currentStock ? Number(currentStock.purchaseQty ?? currentStock.onHandQuantity) : 0,
            currentWAC,
            allQtys.purchaseQty,
            incomingCost,
          );

          const movementValue = allQtys.purchaseQty * incomingCost;

          const movement = await tx.stockMovement.create({
            data: {
              tenantId,
              movementNumber,
              movementType: 'receipt',
              itemId: line.itemId,
              fromWarehouseId: null,
              toWarehouseId: dto.warehouseId,
              quantity: allQtys.storageQty,
              uom: allQtys.storageUom,
              purchaseQty: allQtys.purchaseQty,
              purchaseUom: allQtys.purchaseUom,
              consumptionQty: allQtys.consumptionQty,
              consumptionUom: allQtys.consumptionUom,
              unitCost: incomingCost,
              unitCostAtMovement: incomingCost,
              movementValue: Math.round(movementValue * 100) / 100,
              lotNumber: line.lotNumber ?? null,
              referenceType: 'GRN',
              referenceId: grn.id,
              notes: line.notes ?? null,
              createdBy: userId,
            },
          });

          await tx.goodsReceiptLine.create({
            data: {
              tenantId,
              grnId: grn.id,
              lineNumber: lineNumber++,
              poLineId: line.poLineId ?? null,
              itemId: line.itemId,
              warehouseId: dto.warehouseId,
              stockMovementId: movement.id,
              receivedQuantity: allQtys.purchaseQty,
              uom: allQtys.purchaseUom,
              storageQty: allQtys.storageQty,
              storageUom: allQtys.storageUom,
              consumptionQty: allQtys.consumptionQty,
              consumptionUom: allQtys.consumptionUom,
              unitCost: unitCost,
              lotNumber: line.lotNumber ?? null,
              expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
              notes: line.notes ?? null,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          // Upsert stock (Stock has no soft delete — tenantId scope only)
          if (currentStock) {
            await tx.stock.updateMany({
              where: { id: currentStock.id, tenantId },
              data: {
                purchaseQty: wacResult.newPurchaseQty,
                purchaseUom: allQtys.purchaseUom,
                onHandQuantity: { increment: allQtys.storageQty },
                storageQty: { increment: allQtys.storageQty },
                storageUom: allQtys.storageUom,
                consumptionQty: { increment: allQtys.consumptionQty },
                consumptionUom: allQtys.consumptionUom,
                unitCost: wacResult.newUnitCost,
              },
            });
          } else {
            await tx.stock.create({
              data: {
                tenantId,
                itemId: line.itemId,
                warehouseId: dto.warehouseId,
                purchaseQty: allQtys.purchaseQty,
                purchaseUom: allQtys.purchaseUom,
                onHandQuantity: allQtys.storageQty,
                storageQty: allQtys.storageQty,
                storageUom: allQtys.storageUom,
                consumptionQty: allQtys.consumptionQty,
                consumptionUom: allQtys.consumptionUom,
                reservedQuantity: 0,
                unitCost: incomingCost,
              },
            });
          }

          if (line.poLineId) {
            await tx.purchaseOrderLine.updateMany({
              where: { id: line.poLineId, tenantId, deletedAt: null },
              data: { receivedQuantity: { increment: allQtys.purchaseQty } },
            });
          }
        }

        // Update PO status
        if (dto.poId) {
          const poLines = await tx.purchaseOrderLine.findMany({
            where: { purchaseOrderId: dto.poId, tenantId, deletedAt: null },
          });
          const allReceived = poLines.every(
            (l) => Number(l.receivedQuantity) >= Number(l.orderedQuantity),
          );
          const anyReceived = poLines.some((l) => Number(l.receivedQuantity) > 0);
          const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : 'confirmed';
          await tx.purchaseOrder.updateMany({
            where: { id: dto.poId, tenantId, deletedAt: null },
            data: { status: newStatus, updatedBy: userId },
          });
        }

        return grn;
      });
    } catch (e: any) {
      // Concurrent creates can collide on @@unique([tenantId, grnNumber]) or
      // the movement number — surface as a retryable conflict, not a 500.
      if (e?.code === 'P2002')
        throw new ConflictException('Document number collision — please retry the request');
      throw e;
    }

    return this.findOne(tenantId, grn.id);
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const grns = await this.prisma.goodsReceipt.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        purchaseOrder: {
          select: { poNumber: true, supplier: { select: { name: true, code: true } } },
        },
        supplier: { select: { name: true, code: true } },
        warehouse: { select: { code: true, name: true } },
        lines: {
          where: { deletedAt: null },
          include: { item: { select: { code: true, name: true } } },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const goodsReceipts = grns.map((g) => ({
      ...g,
      lineCount: g._count.lines,
      totalValue: g.lines.reduce(
        (sum, l) => sum + Number(l.receivedQuantity) * Number(l.unitCost ?? 0),
        0,
      ),
      // Prefer direct supplierId relation (manual GRNs); fall back to PO supplier
      supplierName: g.supplier?.name ?? g.purchaseOrder?.supplier?.name ?? null,
      supplierCode: g.supplier?.code ?? g.purchaseOrder?.supplier?.code ?? null,
      poNumber: g.purchaseOrder?.poNumber ?? null,
      warehouseCode: g.warehouse.code,
      warehouseName: g.warehouse.name,
    }));
    return { goodsReceipts, count: goodsReceipts.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        purchaseOrder: {
          select: {
            poNumber: true,
            status: true,
            total: true,
            supplier: { select: { name: true, code: true } },
          },
        },
        supplier: { select: { name: true, code: true } },
        warehouse: { select: { code: true, name: true } },
        lines: {
          where: { deletedAt: null },
          orderBy: { lineNumber: 'asc' },
          include: {
            item: { select: { code: true, name: true, baseUom: true } },
            purchaseOrderLine: { select: { orderedQuantity: true, unitPrice: true } },
            stockMovement: { select: { id: true, movementType: true } },
          },
        },
      },
    });
    if (!grn) throw new NotFoundException(`GRN ${id} not found`);
    return {
      ...grn,
      supplierName: grn.supplier?.name ?? grn.purchaseOrder?.supplier?.name ?? null,
      supplierCode: grn.supplier?.code ?? grn.purchaseOrder?.supplier?.code ?? null,
      poNumber: grn.purchaseOrder?.poNumber ?? null,
      warehouseCode: grn.warehouse.code,
      warehouseName: grn.warehouse.name,
    };
  }

  // ── Find by PO ─────────────────────────────────────────────────────────────

  async findByPo(tenantId: string, poId: string) {
    const goodsReceipts = await this.prisma.goodsReceipt.findMany({
      where: { tenantId, poId, deletedAt: null },
      include: {
        warehouse: { select: { code: true, name: true } },
        lines: {
          where: { deletedAt: null },
          include: { item: { select: { code: true, name: true } } },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { goodsReceipts, count: goodsReceipts.length };
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateGoodsReceiptDto) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new BadRequestException('Cannot update a cancelled GRN');
    await this.prisma.goodsReceipt.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.findOne(tenantId, id);
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(tenantId: string, userId: string, id: string) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new ConflictException('GRN is already cancelled');

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceipt.updateMany({
        where: { id, tenantId, deletedAt: null },
        data: { status: 'cancelled', updatedBy: userId },
      });

      for (const line of grn.lines) {
        const originalMovement = line.stockMovementId
          ? await tx.stockMovement.findFirst({
              where: { id: line.stockMovementId, tenantId },
            })
          : null;

        const originalCost = originalMovement?.unitCostAtMovement
          ? Number(originalMovement.unitCostAtMovement)
          : Number(line.unitCost ?? 0);

        const purchaseQty = Number(line.receivedQuantity);
        const storageQty = Number(line.storageQty ?? line.receivedQuantity);
        const consumptionQty = Number(line.consumptionQty ?? line.receivedQuantity);
        const storageUom = line.storageUom ?? line.uom;
        const consumptionUom = line.consumptionUom ?? line.uom;

        const currentStock = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId, warehouseId: grn.warehouseId },
        });
        if (currentStock && Number(currentStock.purchaseQty) < purchaseQty) {
          throw new ConflictException(
            `Cannot cancel GRN ${grn.grnNumber}: stock for item ${line.itemId} ` +
              `has been partially consumed (available: ${currentStock.purchaseQty}, required: ${purchaseQty}).`,
          );
        }

        const reversalNumber = await this.generateMovementNumber(tx, tenantId);
        const movementValue = -(purchaseQty * originalCost);

        await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber: reversalNumber,
            movementType: 'adjustment',
            itemId: line.itemId,
            fromWarehouseId: grn.warehouseId,
            toWarehouseId: null,
            quantity: -storageQty,
            uom: storageUom,
            purchaseQty: -purchaseQty,
            purchaseUom: line.uom,
            consumptionQty: -consumptionQty,
            consumptionUom: consumptionUom,
            unitCost: originalCost,
            unitCostAtMovement: originalCost,
            movementValue: Math.round(movementValue * 100) / 100,
            referenceType: 'GRN_CANCEL',
            referenceId: id,
            notes: `Reversal of GRN ${grn.grnNumber}`,
            createdBy: userId,
          },
        });

        if (currentStock) {
          const currentPurchaseQty = Number(
            currentStock.purchaseQty ?? currentStock.onHandQuantity,
          );
          const currentUnitCost = Number(currentStock.unitCost ?? 0);
          const newPurchaseQty = currentPurchaseQty - purchaseQty;
          const newTotalValue = currentPurchaseQty * currentUnitCost - purchaseQty * originalCost;
          const newWAC =
            newPurchaseQty > 0 ? Math.round((newTotalValue / newPurchaseQty) * 10_000) / 10_000 : 0;

          await tx.stock.updateMany({
            where: { id: currentStock.id, tenantId },
            data: {
              purchaseQty: newPurchaseQty,
              onHandQuantity: { decrement: storageQty },
              storageQty: { decrement: storageQty },
              consumptionQty: { decrement: consumptionQty },
              unitCost: newWAC,
            },
          });
        }

        if (line.poLineId) {
          await tx.purchaseOrderLine.updateMany({
            where: { id: line.poLineId, tenantId, deletedAt: null },
            data: { receivedQuantity: { decrement: purchaseQty } },
          });
        }
      }

      if (grn.poId) {
        const poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: grn.poId, tenantId, deletedAt: null },
        });
        const anyReceived = poLines.some((l) => Number(l.receivedQuantity) > 0);
        await tx.purchaseOrder.updateMany({
          where: { id: grn.poId, tenantId, deletedAt: null },
          data: { status: anyReceived ? 'partial' : 'confirmed', updatedBy: userId },
        });
      }
    });

    return { message: `GRN ${grn.grnNumber} cancelled successfully`, id };
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(tenantId: string) {
    const [total, posted, cancelled, today] = await Promise.all([
      this.prisma.goodsReceipt.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.goodsReceipt.count({ where: { tenantId, status: 'posted', deletedAt: null } }),
      this.prisma.goodsReceipt.count({ where: { tenantId, status: 'cancelled', deletedAt: null } }),
      this.prisma.goodsReceipt.count({
        where: {
          tenantId,
          deletedAt: null,
          receivedDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ]);

    const valueAgg = await this.prisma.$queryRaw<{ total_value: number }[]>`
      SELECT COALESCE(SUM(l.received_quantity * COALESCE(l.unit_cost, 0)), 0)::float AS total_value
      FROM grn_receipt_lines l
      JOIN grn_receipts g ON g.id = l.grn_id
      WHERE g.tenant_id = ${tenantId}::uuid
        AND g.status    = 'posted'
        AND g.deleted_at IS NULL
        AND l.deleted_at IS NULL
    `;

    return { total, posted, cancelled, today, totalValue: valueAgg[0]?.total_value ?? 0 };
  }
}
