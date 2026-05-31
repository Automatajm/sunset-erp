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
    const last = await this.prisma.goodsReceipt.findFirst({
      where: { tenantId, grnNumber: { startsWith: prefix } },
      orderBy: { grnNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.grnNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Auto-generate movement number ─────────────────────────────────────────

  private async generateMovementNumber(tx: any, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MOV-${year}`;
    const last = await tx.stockMovement.findFirst({
      where: { tenantId, movementNumber: { startsWith: prefix } },
      orderBy: { movementNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.movementNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Resolve supplierId: from DTO, or from PO ───────────────────────────────

  private async resolveSupplierID(
    dto: CreateGoodsReceiptDto,
    tenantId: string,
  ): Promise<string | null> {
    if (dto.supplierId) return dto.supplierId;
    if (dto.poId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: dto.poId, tenantId },
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
      lineData.push(allQties);
    }

    const grnNumber = await this.generateGrnNumber(tenantId);

    const grn = await this.prisma.$transaction(async (tx) => {
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

        // Upsert stock
        if (currentStock) {
          await tx.stock.update({
            where: { id: currentStock.id },
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
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data: { receivedQuantity: { increment: allQtys.purchaseQty } },
          });
        }
      }

      // Update PO status
      if (dto.poId) {
        const poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: dto.poId, deletedAt: null },
        });
        const allReceived = poLines.every(
          (l) => Number(l.receivedQuantity) >= Number(l.orderedQuantity),
        );
        const anyReceived = poLines.some((l) => Number(l.receivedQuantity) > 0);
        const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : 'confirmed';
        await tx.purchaseOrder.update({
          where: { id: dto.poId },
          data: { status: newStatus, updatedBy: userId },
        });
      }

      return grn;
    });

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

    return grns.map((g) => ({
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
    return this.prisma.goodsReceipt.findMany({
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
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateGoodsReceiptDto) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new BadRequestException('Cannot update a cancelled GRN');
    return this.prisma.goodsReceipt.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(tenantId: string, userId: string, id: string) {
    const grn = await this.findOne(tenantId, id);
    if (grn.status === 'cancelled') throw new ConflictException('GRN is already cancelled');

    await this.prisma.$transaction(async (tx) => {
      await tx.goodsReceipt.update({
        where: { id },
        data: { status: 'cancelled', updatedBy: userId },
      });

      for (const line of grn.lines) {
        const originalMovement = line.stockMovementId
          ? await tx.stockMovement.findFirst({ where: { id: line.stockMovementId } })
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

          await tx.stock.update({
            where: { id: currentStock.id },
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
          await tx.purchaseOrderLine.update({
            where: { id: line.poLineId },
            data: { receivedQuantity: { decrement: purchaseQty } },
          });
        }
      }

      if (grn.poId) {
        const poLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: grn.poId, deletedAt: null },
        });
        const anyReceived = poLines.some((l) => Number(l.receivedQuantity) > 0);
        await tx.purchaseOrder.update({
          where: { id: grn.poId },
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

  // ── Inventory Turnover ─────────────────────────────────────────────────────

  async getInventoryTurnover(
    tenantId: string,
    filters?: {
      warehouseId?: string;
      itemType?: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const now = new Date();
    const dateFrom = filters?.dateFrom
      ? new Date(filters.dateFrom)
      : new Date(now.getFullYear(), 0, 1);
    const dateTo = filters?.dateTo ? new Date(filters.dateTo + 'T23:59:59Z') : now;
    const days = Math.max(
      1,
      Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const stockWhere: any = { tenantId };
    if (filters?.warehouseId) stockWhere.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        item: { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    const filtered = stock.filter(
      (s) => !filters?.itemType || s.item.itemType === filters.itemType,
    );

    const issueWhere: any = {
      tenantId,
      movementType: 'issue',
      movementDate: { gte: dateFrom, lte: dateTo },
    };
    if (filters?.warehouseId)
      issueWhere.OR = [
        { fromWarehouseId: filters.warehouseId },
        { toWarehouseId: filters.warehouseId },
      ];

    const issues = await this.prisma.stockMovement.findMany({
      where: issueWhere,
      include: { item: { select: { id: true, itemType: true } } },
    });

    const cogsMap = new Map<string, number>();
    for (const mv of issues) {
      if (!mv.itemId) continue;
      if (filters?.itemType && mv.item?.itemType !== filters.itemType) continue;
      const val = Math.abs(
        mv.movementValue
          ? Number(mv.movementValue)
          : Number(mv.quantity) * Number(mv.unitCost ?? 0),
      );
      cogsMap.set(mv.itemId, (cogsMap.get(mv.itemId) ?? 0) + val);
    }

    const openingWhere: any = { tenantId, movementDate: { lt: dateFrom } };
    if (filters?.warehouseId)
      openingWhere.OR = [
        { fromWarehouseId: filters.warehouseId },
        { toWarehouseId: filters.warehouseId },
      ];

    const openingMovements = await this.prisma.stockMovement.findMany({
      where: openingWhere,
      select: {
        itemId: true,
        movementType: true,
        purchaseQty: true,
        unitCost: true,
        movementValue: true,
        item: { select: { id: true, itemType: true } },
      },
    });

    const openingQtyMap = new Map<string, number>();
    const openingCostMap = new Map<string, number>();
    for (const mv of openingMovements) {
      if (!mv.itemId) continue;
      if (filters?.itemType && mv.item?.itemType !== filters.itemType) continue;
      const qty = Number(mv.purchaseQty ?? 0);
      openingQtyMap.set(
        mv.itemId,
        (openingQtyMap.get(mv.itemId) ?? 0) + (mv.movementType === 'issue' ? -qty : qty),
      );
      if (mv.movementType !== 'issue' && mv.unitCost)
        openingCostMap.set(mv.itemId, Number(mv.unitCost));
    }

    const itemMap = new Map<string, any>();
    for (const s of filtered) {
      const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
      const unitCost = Number(s.unitCost ?? 0);
      const value = Math.round(purchaseQty * unitCost * 100) / 100;
      const ex = itemMap.get(s.item.id);
      if (ex) {
        ex.closingValue += value;
        ex.closingQty += purchaseQty;
        ex.warehouses.push(s.warehouse.code);
      } else
        itemMap.set(s.item.id, {
          itemId: s.item.id,
          itemCode: s.item.code,
          itemName: s.item.name,
          itemType: s.item.itemType,
          closingValue: value,
          closingQty: purchaseQty,
          unitCost,
          cogs: 0,
          warehouses: [s.warehouse.code],
        });
    }

    for (const [itemId, cogs] of cogsMap) {
      const ex = itemMap.get(itemId);
      if (ex) ex.cogs = Math.round(cogs * 100) / 100;
    }

    const rows = [...itemMap.values()].map((item) => {
      const openingQty = Math.max(0, openingQtyMap.get(item.itemId) ?? 0);
      const openingCost = openingCostMap.get(item.itemId) ?? item.unitCost;
      const openingValue = Math.round(openingQty * openingCost * 100) / 100;
      const avgInventory = Math.round(((openingValue + item.closingValue) / 2) * 100) / 100;
      const annualizedCogs =
        days < 365 ? Math.round((item.cogs / days) * 365 * 100) / 100 : item.cogs;
      const turnoverRatio =
        avgInventory > 0 ? Math.round((annualizedCogs / avgInventory) * 100) / 100 : null;
      const daysOnHand =
        turnoverRatio && turnoverRatio > 0 ? Math.round((365 / turnoverRatio) * 10) / 10 : null;
      let performance: 'excellent' | 'good' | 'fair' | 'poor' | 'no_movement';
      if (item.cogs === 0) performance = 'no_movement';
      else if (!turnoverRatio) performance = 'poor';
      else if (turnoverRatio >= 12) performance = 'excellent';
      else if (turnoverRatio >= 6) performance = 'good';
      else if (turnoverRatio >= 3) performance = 'fair';
      else performance = 'poor';
      return {
        itemId: item.itemId,
        itemCode: item.itemCode,
        itemName: item.itemName,
        itemType: item.itemType,
        warehouses: [...new Set(item.warehouses)],
        openingValue,
        closingValue: Math.round(item.closingValue * 100) / 100,
        avgInventory,
        cogs: item.cogs,
        annualizedCogs,
        turnoverRatio,
        daysOnHand,
        performance,
      };
    });

    rows.sort((a, b) =>
      a.turnoverRatio === null
        ? -1
        : b.turnoverRatio === null
          ? 1
          : a.turnoverRatio - b.turnoverRatio,
    );

    const totalCogs = Math.round(rows.reduce((s, r) => s + r.cogs, 0) * 100) / 100;
    const totalAvgInventory = Math.round(rows.reduce((s, r) => s + r.avgInventory, 0) * 100) / 100;
    const overallTurnover =
      totalAvgInventory > 0 ? Math.round((totalCogs / totalAvgInventory) * 100) / 100 : null;
    const overallDaysOnHand =
      overallTurnover && overallTurnover > 0 ? Math.round((365 / overallTurnover) * 10) / 10 : null;

    return {
      rows,
      summary: {
        totalItems: rows.length,
        totalCogs,
        totalAvgInventory,
        totalClosingValue: Math.round(rows.reduce((s, r) => s + r.closingValue, 0) * 100) / 100,
        overallTurnover,
        overallDaysOnHand,
        periodDays: days,
        excellentCount: rows.filter((r) => r.performance === 'excellent').length,
        goodCount: rows.filter((r) => r.performance === 'good').length,
        fairCount: rows.filter((r) => r.performance === 'fair').length,
        poorCount: rows.filter((r) => r.performance === 'poor').length,
        noMovementCount: rows.filter((r) => r.performance === 'no_movement').length,
      },
      period: {
        dateFrom: dateFrom.toISOString().split('T')[0],
        dateTo: dateTo.toISOString().split('T')[0],
        days,
        isAnnualized: days < 365,
      },
      asOf: new Date(),
    };
  }
}
