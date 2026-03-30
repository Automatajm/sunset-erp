import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StockTransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createStockTransactionDto: CreateStockTransactionDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: createStockTransactionDto.itemId, tenantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Item not found');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: createStockTransactionDto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const movementNumber = await this.generateMovementNumber(tenantId);

    const result = await this.prisma.$transaction(async (tx) => {
      const isReceipt = createStockTransactionDto.transactionType === 'receipt';
      const isIssue   = createStockTransactionDto.transactionType === 'issue';

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          movementNumber,
          movementType:   createStockTransactionDto.transactionType,
          movementDate:   createStockTransactionDto.transactionDate
            ? new Date(createStockTransactionDto.transactionDate)
            : new Date(),
          itemId:         createStockTransactionDto.itemId,
          fromWarehouseId: isIssue   ? createStockTransactionDto.warehouseId : null,
          toWarehouseId:   isReceipt ? createStockTransactionDto.warehouseId : null,
          quantity:        new Decimal(Math.abs(createStockTransactionDto.quantity)),
          uom:             createStockTransactionDto.uom,
          lotNumber:       createStockTransactionDto.lotNumber,
          serialNumber:    createStockTransactionDto.serialNumber,
          referenceType:   createStockTransactionDto.referenceType,
          referenceId:     createStockTransactionDto.referenceId,
          notes:           createStockTransactionDto.notes,
          createdBy:       userId,
        },
      });

      const existingStock = await tx.stock.findFirst({
        where: { tenantId, itemId: createStockTransactionDto.itemId, warehouseId: createStockTransactionDto.warehouseId },
      });

      if (existingStock) {
        const newQuantity = existingStock.onHandQuantity.toNumber() + createStockTransactionDto.quantity;
        await tx.stock.update({
          where: { id: existingStock.id },
          data: { onHandQuantity: new Decimal(newQuantity) },
        });
      } else {
        await tx.stock.create({
          data: {
            tenantId,
            itemId:          createStockTransactionDto.itemId,
            warehouseId:     createStockTransactionDto.warehouseId,
            onHandQuantity:  new Decimal(Math.max(0, createStockTransactionDto.quantity)),
            reservedQuantity: new Decimal(0),
            unitCost:        new Decimal(0),
            lotNumber:       createStockTransactionDto.lotNumber,
            serialNumber:    createStockTransactionDto.serialNumber,
          },
        });
      }
      return movement;
    });

    return this.findOne(tenantId, result.id);
  }

  async findAll(tenantId: string, filters?: { itemId?: string; warehouseId?: string; transactionType?: string }) {
    const where: any = { tenantId };
    if (filters?.itemId)          where.itemId      = filters.itemId;
    if (filters?.transactionType) where.movementType = filters.transactionType;

    return this.prisma.stockMovement.findMany({
      where,
      include: { item: true, fromWarehouse: true, toWarehouse: true },
      orderBy: { movementDate: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: { id, tenantId },
      include: { item: true, fromWarehouse: true, toWarehouse: true },
    });
    if (!movement) throw new NotFoundException(`Stock movement with ID ${id} not found`);
    return { ...movement, quantity: movement.quantity.toNumber() };
  }

  async getStockBalance(tenantId: string, filters?: { itemId?: string; warehouseId?: string }) {
    const where: any = { tenantId };
    if (filters?.itemId)      where.itemId      = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: { item: true, warehouse: true },
      orderBy: [{ item: { code: 'asc' } }, { warehouse: { code: 'asc' } }],
    });

    return stock.map(s => ({
      ...s,
      onHandQuantity:   s.onHandQuantity.toNumber(),
      reservedQuantity: s.reservedQuantity.toNumber(),
      unitCost:         s.unitCost?.toNumber() ?? 0,
    }));
  }

  private async generateMovementNumber(tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `SM-${year}`;
    const last   = await this.prisma.stockMovement.findFirst({
      where:   { tenantId, movementNumber: { startsWith: prefix } },
      orderBy: { movementNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.movementNumber.split('-')[2]);
    return `${prefix}-${(n + 1).toString().padStart(4, '0')}`;
  }

  // ============================================================================
  // INTERNAL — called by AP and AR services automatically
  // ============================================================================

  async receiveFromApInvoice(
    tenantId: string,
    userId: string,
    apInvoice: {
      id: string;
      invoiceNumber: string;
      lines: Array<{ itemId: string | null; quantity: number; uom: string | null; unitPrice: number; description: string | null }>;
    },
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });
    if (!warehouse) return;

    for (const line of apInvoice.lines) {
      if (!line.itemId || line.quantity <= 0) continue;
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null, isStockable: true },
      });
      if (!item) continue;
      const movementNumber = await this.generateMovementNumber(tenantId);

      await this.prisma.$transaction(async (tx) => {
        await tx.stockMovement.create({
          data: {
            tenantId, movementNumber, movementType: 'receipt', movementDate: new Date(),
            itemId: line.itemId!, toWarehouseId: warehouse.id,
            quantity: new Decimal(line.quantity), uom: line.uom ?? item.baseUom,
            unitCost: new Decimal(line.unitPrice),
            referenceType: 'ap_invoice', referenceId: apInvoice.id,
            notes: `AP Receipt — ${apInvoice.invoiceNumber}`, createdBy: userId,
          },
        });

        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId!, warehouseId: warehouse.id },
        });

        if (existing) {
          const oldQty = Number(existing.onHandQuantity);
          const oldCost = Number(existing.unitCost ?? 0);
          const totalQty = oldQty + line.quantity;
          const wac = totalQty > 0 ? (oldQty * oldCost + line.quantity * line.unitPrice) / totalQty : line.unitPrice;
          await tx.stock.update({
            where: { id: existing.id },
            data: { onHandQuantity: new Decimal(totalQty), unitCost: new Decimal(Math.round(wac * 10000) / 10000) },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId, itemId: line.itemId!, warehouseId: warehouse.id,
              onHandQuantity: new Decimal(line.quantity), reservedQuantity: new Decimal(0),
              unitCost: new Decimal(line.unitPrice),
            },
          });
        }
      });
    }
  }

  async shipFromArInvoice(
    tenantId: string,
    userId: string,
    arInvoice: {
      id: string;
      invoiceNumber: string;
      lines: Array<{ itemId: string | null; quantity: number; uom: string | null; description: string | null }>;
    },
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });
    if (!warehouse) return;

    for (const line of arInvoice.lines) {
      if (!line.itemId || line.quantity <= 0) continue;
      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null, isStockable: true },
      });
      if (!item) continue;
      const movementNumber = await this.generateMovementNumber(tenantId);

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId!, warehouseId: warehouse.id },
        });
        const unitCost = existing ? Number(existing.unitCost ?? 0) : 0;

        await tx.stockMovement.create({
          data: {
            tenantId, movementNumber, movementType: 'issue', movementDate: new Date(),
            itemId: line.itemId!, fromWarehouseId: warehouse.id,
            quantity: new Decimal(line.quantity), uom: line.uom ?? item.baseUom,
            unitCost: new Decimal(unitCost),
            referenceType: 'ar_invoice', referenceId: arInvoice.id,
            notes: `AR Shipment — ${arInvoice.invoiceNumber}`, createdBy: userId,
          },
        });

        if (existing) {
          const newQty = Math.max(0, Number(existing.onHandQuantity) - line.quantity);
          await tx.stock.update({ where: { id: existing.id }, data: { onHandQuantity: new Decimal(newQty) } });
        }
      });
    }
  }

  // ============================================================================
  // LEDGER
  // ============================================================================

  async getLedger(tenantId: string, filters?: {
    itemId?: string; warehouseId?: string; itemType?: string;
    movementType?: string; referenceNumber?: string; dateFrom?: string; dateTo?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.itemId)       where.itemId       = filters.itemId;
    if (filters?.movementType) where.movementType = filters.movementType;
    if (filters?.warehouseId) {
      where.OR = [{ fromWarehouseId: filters.warehouseId }, { toWarehouseId: filters.warehouseId }];
    }
    if (filters?.dateFrom || filters?.dateTo) {
      where.movementDate = {};
      if (filters.dateFrom) where.movementDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo)   where.movementDate.lte = new Date(filters.dateTo + 'T23:59:59Z');
    }

    const movements = await this.prisma.stockMovement.findMany({
      where,
      include: {
        item:          { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        fromWarehouse: { select: { id: true, code: true, name: true } },
        toWarehouse:   { select: { id: true, code: true, name: true } },
      },
      orderBy: { movementDate: 'asc' },
    });

    let filtered = movements.filter(m => !filters?.itemType || m.item?.itemType === filters.itemType);

    // ── Resolve reference numbers ─────────────────────────────────────────────
    const arIds = [...new Set(filtered.filter(m => m.referenceType === 'ar_invoice'     && m.referenceId).map(m => m.referenceId!))];
    const apIds = [...new Set(filtered.filter(m => m.referenceType === 'ap_invoice'     && m.referenceId).map(m => m.referenceId!))];
    const poIds = [...new Set(filtered.filter(m => m.referenceType === 'purchase_order' && m.referenceId).map(m => m.referenceId!))];

    const [arInvoices, apInvoices, poOrders] = await Promise.all([
      arIds.length > 0 ? this.prisma.arInvoice.findMany({     where: { id: { in: arIds } }, select: { id: true, invoiceNumber: true } }) : [],
      apIds.length > 0 ? this.prisma.apInvoice.findMany({     where: { id: { in: apIds } }, select: { id: true, invoiceNumber: true } }) : [],
      poIds.length > 0 ? this.prisma.purchaseOrder.findMany({ where: { id: { in: poIds } }, select: { id: true, poNumber: true    } }) : [],
    ]);

    const arMap = new Map<string, string>(arInvoices.map(i => [i.id, i.invoiceNumber]   as [string, string]));
    const apMap = new Map<string, string>(apInvoices.map(i => [i.id, i.invoiceNumber]   as [string, string]));
    const poMap = new Map<string, string>((poOrders as any[]).map(p => [p.id, p.poNumber] as [string, string]));

    const resolveRef = (m: any): string => {
      if (!m.referenceType || !m.referenceId)    return '—';
      if (m.referenceType === 'ar_invoice')      return arMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'ap_invoice')      return apMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'purchase_order')  return poMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'opening_balance') return 'Opening Balance';
      return m.referenceId ?? '—';
    };

    if (filters?.referenceNumber) {
      const q = filters.referenceNumber.toLowerCase();
      filtered = filtered.filter(m => resolveRef(m).toLowerCase().includes(q));
    }

    // ── Running balance ───────────────────────────────────────────────────────
    const balanceMap: Record<string, number> = {};

    if (filters?.dateFrom) {
      const beforeMovements = await this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...(filters.itemId      ? { itemId: filters.itemId } : {}),
          ...(filters.warehouseId ? { OR: [{ fromWarehouseId: filters.warehouseId }, { toWarehouseId: filters.warehouseId }] } : {}),
          movementDate: { lt: new Date(filters.dateFrom) },
        },
        select: { itemId: true, fromWarehouseId: true, toWarehouseId: true, movementType: true, quantity: true },
      });
      for (const m of beforeMovements) {
        const whId = m.toWarehouseId ?? m.fromWarehouseId ?? 'unknown';
        const key  = `${m.itemId}:${whId}`;
        if (!balanceMap[key]) balanceMap[key] = 0;
        balanceMap[key] += ['issue'].includes(m.movementType) ? -Number(m.quantity) : Number(m.quantity);
      }
    }

    const rows = filtered.map(m => {
      const whId       = m.toWarehouseId ?? m.fromWarehouseId ?? 'unknown';
      const key        = `${m.itemId}:${whId}`;
      const isOut      = m.movementType === 'issue';
      const qty        = Number(m.quantity);
      const signedQty  = isOut ? -qty : qty;
      const unitCost   = Number(m.unitCost ?? 0);
      const totalValue = Math.round(Math.abs(signedQty) * unitCost * 100) / 100;

      if (!balanceMap[key]) balanceMap[key] = 0;
      const openingBalance = balanceMap[key];
      balanceMap[key]     += signedQty;
      const closingBalance = balanceMap[key];

      return {
        id:              m.id,
        movementNumber:  m.movementNumber,
        movementType:    m.movementType,
        movementDate:    m.movementDate,
        item:            m.item,
        warehouse:       m.toWarehouse ?? m.fromWarehouse ?? null,
        warehouseId:     whId,
        referenceType:   m.referenceType,
        referenceNumber: resolveRef(m),
        quantity:        qty,
        signedQuantity:  signedQty,
        uom:             m.uom,
        unitCost,
        totalValue:      isOut ? -totalValue : totalValue,
        openingBalance:  Math.round(openingBalance * 1000) / 1000,
        closingBalance:  Math.round(closingBalance * 1000) / 1000,
        notes:           m.notes,
      };
    });

    const totalIn       = rows.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.quantity,             0);
    const totalOut      = rows.filter(r => r.signedQuantity < 0).reduce((s, r) => s + r.quantity,             0);
    const totalInValue  = rows.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.totalValue,           0);
    const totalOutValue = rows.filter(r => r.signedQuantity < 0).reduce((s, r) => s + Math.abs(r.totalValue), 0);

    return {
      rows,
      totals: {
        totalIn:        Math.round(totalIn        * 1000) / 1000,
        totalOut:       Math.round(totalOut       * 1000) / 1000,
        netMovement:    Math.round((totalIn - totalOut) * 1000) / 1000,
        totalInValue:   Math.round(totalInValue   * 100)  / 100,
        totalOutValue:  Math.round(totalOutValue  * 100)  / 100,
        netValue:       Math.round((totalInValue - totalOutValue) * 100) / 100,
        openingBalance: rows.length > 0 ? rows[0].openingBalance                : 0,
        closingBalance: rows.length > 0 ? rows[rows.length - 1].closingBalance  : 0,
      },
      count: rows.length,
    };
  }

  // ============================================================================
  // VALUATION
  // ============================================================================

  async getValuation(tenantId: string, filters?: { warehouseId?: string; itemType?: string }) {
    const where: any = { tenantId };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: {
        item:      { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ item: { code: 'asc' } }, { warehouse: { code: 'asc' } }],
    });

    const rows = stock
      .filter(s => !filters?.itemType || s.item.itemType === filters.itemType)
      .map(s => {
        const onHand     = Number(s.onHandQuantity);
        const unitCost   = Number(s.unitCost ?? 0);
        const totalValue = Math.round(onHand * unitCost * 100) / 100;
        return {
          itemId: s.item.id, itemCode: s.item.code, itemName: s.item.name, itemType: s.item.itemType,
          warehouseId: s.warehouse.id, warehouseCode: s.warehouse.code, warehouseName: s.warehouse.name,
          onHandQuantity: onHand, unitCost, totalValue, uom: s.item.baseUom,
        };
      });

    return {
      asOf: new Date(),
      rows,
      totalInventoryValue: Math.round(rows.reduce((sum, r) => sum + r.totalValue, 0) * 100) / 100,
      totalItems: rows.length,
    };
  }

  // ============================================================================
  // STOCK PLANNING
  // ============================================================================

  async getStockPlanning(tenantId: string, filters?: { warehouseId?: string; itemType?: string; alertOnly?: boolean }) {
    const stockWhere: any = { tenantId };
    if (filters?.warehouseId) stockWhere.warehouseId = filters.warehouseId;

    const stockPositions = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        item: {
          select: {
            id: true, code: true, name: true, itemType: true, baseUom: true,
            reorderPoint: true, safetyStock: true, reorderQuantity: true,
            leadTimeDays: true, standardCost: true, defaultSupplierId: true,
            isPurchasable: true, isManufacturable: true,
          },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ item: { code: 'asc' } }],
    });

    const filtered = stockPositions.filter(s => !filters?.itemType || s.item.itemType === filters.itemType);

    const pendingPOLines = await this.prisma.purchaseOrderLine.findMany({
      where: {
        tenantId,
        purchaseOrder: { tenantId, status: { in: ['confirmed', 'approved', 'sent'] }, deletedAt: null },
      },
      include: { purchaseOrder: { select: { id: true, poNumber: true, status: true, expectedDate: true } } },
    });

    const openSOLines = await this.prisma.salesOrderLine.findMany({
      where: {
        tenantId,
        salesOrder: { tenantId, status: { in: ['confirmed', 'shipped'] }, deletedAt: null },
        deletedAt: null,
      },
      include: { salesOrder: { select: { id: true, soNumber: true, status: true, promisedDate: true } } },
    });

    const poSupplyMap = new Map<string, { totalPending: number; orders: Array<{ poNumber: string; pending: number; expectedDate: string | null }> }>();
    for (const line of pendingPOLines) {
      const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      if (pending <= 0 || !line.itemId) continue;
      const ex = poSupplyMap.get(line.itemId) ?? { totalPending: 0, orders: [] };
      ex.totalPending += pending;
      ex.orders.push({ poNumber: line.purchaseOrder.poNumber, pending, expectedDate: line.purchaseOrder.expectedDate?.toISOString().split('T')[0] ?? null });
      poSupplyMap.set(line.itemId, ex);
    }

    const soDemandMap = new Map<string, { totalDemand: number; orders: Array<{ soNumber: string; demand: number; promisedDate: string | null }> }>();
    for (const line of openSOLines) {
      const demand = Number(line.orderedQuantity) - Number(line.shippedQuantity);
      if (demand <= 0 || !line.itemId) continue;
      const ex = soDemandMap.get(line.itemId) ?? { totalDemand: 0, orders: [] };
      ex.totalDemand += demand;
      ex.orders.push({ soNumber: line.salesOrder.soNumber, demand, promisedDate: line.salesOrder.promisedDate?.toISOString().split('T')[0] ?? null });
      soDemandMap.set(line.itemId, ex);
    }

    const rows = filtered.map(s => {
      const onHand    = Number(s.onHandQuantity);
      const reserved  = Number(s.reservedQuantity);
      const available = onHand - reserved;
      const unitCost  = Number(s.unitCost ?? 0);
      const reorderPoint = Number(s.item.reorderPoint ?? 0);
      const safetyStock  = Number(s.item.safetyStock  ?? 0);
      const reorderQty   = Number(s.item.reorderQuantity ?? 0);
      const leadTimeDays = Number(s.item.leadTimeDays ?? 0);

      const poData   = poSupplyMap.get(s.itemId);
      const soData   = soDemandMap.get(s.itemId);
      const poSupply = poData?.totalPending ?? 0;
      const soDemand = soData?.totalDemand  ?? 0;
      const atp      = available + poSupply - soDemand;
      const projectedStock = onHand + poSupply - soDemand;
      const dailyDemand    = soDemand > 0 ? soDemand / 30 : 0;
      const coverageDays   = dailyDemand > 0 ? Math.floor(available / dailyDemand) : available > 0 ? 999 : 0;
      const shortfall      = Math.max(0, reorderPoint + safetyStock - atp);
      const suggestedOrderQty = shortfall > 0 ? Math.max(shortfall, reorderQty) : 0;

      let alertLevel: 'ok' | 'warning' | 'critical' | 'overstock' = 'ok';
      if      (atp < 0)                                 alertLevel = 'critical';
      else if (atp <= safetyStock)                      alertLevel = 'critical';
      else if (atp <= reorderPoint)                     alertLevel = 'warning';
      else if (onHand > reorderPoint * 3 && reorderPoint > 0) alertLevel = 'overstock';

      const hasOpenPO       = poSupply > 0;
      const doubleOrderRisk = atp <= reorderPoint && hasOpenPO;
      const nextReceipt     = poData?.orders.filter(o => o.expectedDate).sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))[0]?.expectedDate ?? null;
      const daysUntilReorder = leadTimeDays > 0 && dailyDemand > 0 ? Math.floor((available - reorderPoint) / dailyDemand) - leadTimeDays : null;

      return {
        itemId: s.item.id, itemCode: s.item.code, itemName: s.item.name, itemType: s.item.itemType,
        warehouseId: s.warehouse.id, warehouseCode: s.warehouse.code, warehouseName: s.warehouse.name,
        uom: s.item.baseUom,
        onHandQty: onHand, reservedQty: reserved, availableQty: available, unitCost,
        stockValue: Math.round(onHand * unitCost * 100) / 100,
        poSupplyQty: Math.round(poSupply * 1000) / 1000,
        soDemandQty: Math.round(soDemand * 1000) / 1000,
        atpQty: Math.round(atp * 1000) / 1000,
        projectedStockQty: Math.round(projectedStock * 1000) / 1000,
        reorderPoint, safetyStock, reorderQty, leadTimeDays,
        suggestedOrderQty: Math.round(suggestedOrderQty * 1000) / 1000,
        coverageDays: coverageDays > 900 ? null : coverageDays,
        dailyDemand: Math.round(dailyDemand * 1000) / 1000,
        daysUntilReorder,
        alertLevel, hasOpenPO, doubleOrderRisk,
        nextReceiptDate: nextReceipt,
        openPOs: poData?.orders ?? [],
        openSOs: soData?.orders ?? [],
      };
    });

    const result = filters?.alertOnly ? rows.filter(r => r.alertLevel !== 'ok') : rows;

    return {
      rows: result,
      summary: {
        total:           result.length,
        critical:        result.filter(r => r.alertLevel === 'critical').length,
        warning:         result.filter(r => r.alertLevel === 'warning').length,
        overstock:       result.filter(r => r.alertLevel === 'overstock').length,
        ok:              result.filter(r => r.alertLevel === 'ok').length,
        doubleOrderRisk: result.filter(r => r.doubleOrderRisk).length,
        totalStockValue: Math.round(result.reduce((s, r) => s + r.stockValue, 0) * 100) / 100,
      },
    };
  }
}