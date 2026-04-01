// ============================================================================
// FILE: backend/src/modules/stock-transactions/stock-transactions.service.ts
// ============================================================================
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StockTransactionsService {
  constructor(
    private prisma: PrismaService,
    private uom:    UomService,
  ) {}

  // ── Create manual stock adjustment ────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateStockTransactionDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, tenantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException('Item not found');

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const movementNumber = await this.generateMovementNumber(tenantId);
    const isReceipt      = dto.transactionType === 'receipt';
    const isIssue        = dto.transactionType === 'issue';
    const absQty         = Math.abs(dto.quantity);

    // Calculate all 3 UOM quantities (ADR-014)
    const allQtys = await this.uom.calcAllQties(absQty, dto.itemId, tenantId);

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          movementNumber,
          movementType:    dto.transactionType,
          movementDate:    dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
          itemId:          dto.itemId,
          fromWarehouseId: isIssue   ? dto.warehouseId : null,
          toWarehouseId:   isReceipt ? dto.warehouseId : null,
          quantity:        new Decimal(absQty),
          uom:             dto.uom ?? allQtys.storageUom,
          purchaseQty:     allQtys.purchaseQty,
          purchaseUom:     allQtys.purchaseUom,
          consumptionQty:  allQtys.consumptionQty,
          consumptionUom:  allQtys.consumptionUom,
          lotNumber:       dto.lotNumber,
          serialNumber:    dto.serialNumber,
          referenceType:   dto.referenceType,
          referenceId:     dto.referenceId,
          notes:           dto.notes,
          createdBy:       userId,
        },
      });

      const existing = await tx.stock.findFirst({
        where: { tenantId, itemId: dto.itemId, warehouseId: dto.warehouseId },
      });

      if (existing) {
        const currentPurchaseQty = Number(existing.purchaseQty ?? existing.onHandQuantity);
        const currentUnitCost    = Number(existing.unitCost ?? 0);
        let newUnitCost    = currentUnitCost;
        let newPurchaseQty = currentPurchaseQty + (isIssue ? -allQtys.purchaseQty : allQtys.purchaseQty);

        if (isReceipt && dto.unitCost) {
          const wacResult = this.uom.calcNewWAC(
            currentPurchaseQty, currentUnitCost,
            allQtys.purchaseQty, dto.unitCost,
          );
          newUnitCost    = wacResult.newUnitCost;
          newPurchaseQty = wacResult.newPurchaseQty;
        }

        await tx.stock.update({
          where: { id: existing.id },
          data: {
            purchaseQty:    Math.max(0, newPurchaseQty),
            purchaseUom:    allQtys.purchaseUom,
            onHandQuantity: { increment: new Decimal(isIssue ? -allQtys.storageQty    : allQtys.storageQty)    },
            storageQty:     { increment: new Decimal(isIssue ? -allQtys.storageQty    : allQtys.storageQty)    },
            storageUom:     allQtys.storageUom,
            consumptionQty: { increment: new Decimal(isIssue ? -allQtys.consumptionQty : allQtys.consumptionQty) },
            consumptionUom: allQtys.consumptionUom,
            unitCost:       new Decimal(newUnitCost),
          },
        });
      } else {
        const initCost = dto.unitCost ?? 0;
        await tx.stock.create({
          data: {
            tenantId,
            itemId:           dto.itemId,
            warehouseId:      dto.warehouseId,
            purchaseQty:      new Decimal(Math.max(0, allQtys.purchaseQty)),
            purchaseUom:      allQtys.purchaseUom,
            onHandQuantity:   new Decimal(Math.max(0, allQtys.storageQty)),
            storageQty:       new Decimal(Math.max(0, allQtys.storageQty)),
            storageUom:       allQtys.storageUom,
            consumptionQty:   new Decimal(Math.max(0, allQtys.consumptionQty)),
            consumptionUom:   allQtys.consumptionUom,
            reservedQuantity: new Decimal(0),
            unitCost:         new Decimal(initCost),
            lotNumber:        dto.lotNumber,
            serialNumber:     dto.serialNumber,
          },
        });
      }

      return movement;
    });

    return this.findOne(tenantId, result.id);
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, filters?: { itemId?: string; warehouseId?: string; transactionType?: string }) {
    const where: any = { tenantId };
    if (filters?.itemId)          where.itemId       = filters.itemId;
    if (filters?.transactionType) where.movementType = filters.transactionType;

    return this.prisma.stockMovement.findMany({
      where,
      include: { item: true, fromWarehouse: true, toWarehouse: true },
      orderBy: { movementDate: 'desc' },
    });
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const movement = await this.prisma.stockMovement.findFirst({
      where:   { id, tenantId },
      include: { item: true, fromWarehouse: true, toWarehouse: true },
    });
    if (!movement) throw new NotFoundException(`Stock movement with ID ${id} not found`);
    return {
      ...movement,
      quantity:       Number(movement.quantity),
      purchaseQty:    movement.purchaseQty    ? Number(movement.purchaseQty)    : null,
      consumptionQty: movement.consumptionQty ? Number(movement.consumptionQty) : null,
      movementValue:  movement.movementValue  ? Number(movement.movementValue)  : null,
    };
  }

  // ── Stock Balance ──────────────────────────────────────────────────────────

  async getStockBalance(tenantId: string, filters?: { itemId?: string; warehouseId?: string }) {
    const where: any = { tenantId };
    if (filters?.itemId)      where.itemId      = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: {
        item:      { include: { purchaseUom: true, storageUom: true, consumptionUom: true } },
        warehouse: true,
      },
      orderBy: [{ item: { code: 'asc' } }, { warehouse: { code: 'asc' } }],
    });

    return stock.map(s => {
      const purchaseQty    = Number(s.purchaseQty    ?? s.onHandQuantity);
      const storageQty     = Number(s.storageQty     ?? s.onHandQuantity);
      const consumptionQty = Number(s.consumptionQty ?? s.onHandQuantity);
      const unitCost       = Number(s.unitCost ?? 0);

      const storageFactor       = Number(s.item.storageToConsumptionFactor  ?? 1);
      const consumptionFactor   = Number(s.item.purchaseToConsumptionFactor ?? 1);
      const unitCostStorage     = storageFactor     > 0 ? unitCost / storageFactor     : unitCost;
      const unitCostConsumption = consumptionFactor > 0 ? unitCost / consumptionFactor : unitCost;

      return {
        ...s,
        purchaseQty,
        purchaseUom:         s.purchaseUom    || s.item.purchaseUom?.code    || s.item.baseUom,
        unitCost,
        totalValue:          Math.round(purchaseQty * unitCost * 100) / 100,
        onHandQuantity:      storageQty,
        storageQty,
        storageUom:          s.storageUom     || s.item.storageUom?.code     || s.item.baseUom,
        unitCostStorage:     Math.round(unitCostStorage     * 10000) / 10000,
        consumptionQty,
        consumptionUom:      s.consumptionUom || s.item.consumptionUom?.code || s.item.baseUom,
        unitCostConsumption: Math.round(unitCostConsumption * 10000) / 10000,
        reservedQuantity:    Number(s.reservedQuantity),
        availableQty:        Math.max(0, storageQty - Number(s.reservedQuantity)),
      };
    });
  }

  // ── Movement number generator ──────────────────────────────────────────────

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

  // ── Internal: receive from AP Invoice ─────────────────────────────────────

  async receiveFromApInvoice(
    tenantId: string,
    userId:   string,
    apInvoice: {
      id:            string;
      invoiceNumber: string;
      lines: Array<{
        itemId:      string | null;
        quantity:    number;
        uom:         string | null;
        unitPrice:   number;
        description: string | null;
      }>;
    },
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where:   { tenantId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });
    if (!warehouse) return;

    for (const line of apInvoice.lines) {
      if (!line.itemId || line.quantity <= 0) continue;

      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null, isStockable: true },
      });
      if (!item) continue;

      const allQtys        = await this.uom.calcAllQties(line.quantity, line.itemId, tenantId);
      const movementNumber = await this.generateMovementNumber(tenantId);

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId!, warehouseId: warehouse.id },
        });

        const wacResult = this.uom.calcNewWAC(
          existing ? Number(existing.purchaseQty ?? existing.onHandQuantity) : 0,
          existing ? Number(existing.unitCost ?? 0) : 0,
          allQtys.purchaseQty,
          line.unitPrice,
        );

        await tx.stockMovement.create({
          data: {
            tenantId, movementNumber, movementType: 'receipt', movementDate: new Date(),
            itemId:             line.itemId!,
            toWarehouseId:      warehouse.id,
            quantity:           new Decimal(allQtys.storageQty),
            uom:                allQtys.storageUom,
            purchaseQty:        allQtys.purchaseQty,
            purchaseUom:        allQtys.purchaseUom,
            consumptionQty:     allQtys.consumptionQty,
            consumptionUom:     allQtys.consumptionUom,
            unitCost:           new Decimal(line.unitPrice),
            unitCostAtMovement: new Decimal(line.unitPrice),
            movementValue:      new Decimal(Math.round(allQtys.purchaseQty * line.unitPrice * 100) / 100),
            referenceType:      'ap_invoice',
            referenceId:        apInvoice.id,
            notes:              `AP Receipt — ${apInvoice.invoiceNumber}`,
            createdBy:          userId,
          },
        });

        if (existing) {
          await tx.stock.update({
            where: { id: existing.id },
            data: {
              purchaseQty:    wacResult.newPurchaseQty,
              purchaseUom:    allQtys.purchaseUom,
              onHandQuantity: { increment: new Decimal(allQtys.storageQty)     },
              storageQty:     { increment: new Decimal(allQtys.storageQty)     },
              storageUom:     allQtys.storageUom,
              consumptionQty: { increment: new Decimal(allQtys.consumptionQty) },
              consumptionUom: allQtys.consumptionUom,
              unitCost:       new Decimal(wacResult.newUnitCost),
            },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId,
              itemId:           line.itemId!,
              warehouseId:      warehouse.id,
              purchaseQty:      new Decimal(allQtys.purchaseQty),
              purchaseUom:      allQtys.purchaseUom,
              onHandQuantity:   new Decimal(allQtys.storageQty),
              storageQty:       new Decimal(allQtys.storageQty),
              storageUom:       allQtys.storageUom,
              consumptionQty:   new Decimal(allQtys.consumptionQty),
              consumptionUom:   allQtys.consumptionUom,
              reservedQuantity: new Decimal(0),
              unitCost:         new Decimal(line.unitPrice),
            },
          });
        }
      });
    }
  }

  // ── Internal: ship from AR Invoice ────────────────────────────────────────

  async shipFromArInvoice(
    tenantId: string,
    userId:   string,
    arInvoice: {
      id:            string;
      invoiceNumber: string;
      lines: Array<{
        itemId:      string | null;
        quantity:    number;
        uom:         string | null;
        description: string | null;
      }>;
    },
  ): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where:   { tenantId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });
    if (!warehouse) return;

    for (const line of arInvoice.lines) {
      if (!line.itemId || line.quantity <= 0) continue;

      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null, isStockable: true },
      });
      if (!item) continue;

      const allQtys        = await this.uom.calcAllQties(line.quantity, line.itemId, tenantId);
      const movementNumber = await this.generateMovementNumber(tenantId);

      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId!, warehouseId: warehouse.id },
        });
        const unitCost = existing ? Number(existing.unitCost ?? 0) : 0;

        const cogsValue = this.uom.calcFinancialValue(
          allQtys.consumptionQty,
          'consumption',
          {
            unitCost,
            purchaseToConsumptionFactor: Number(item.purchaseToConsumptionFactor ?? 1),
            storageToConsumptionFactor:  Number(item.storageToConsumptionFactor  ?? 1),
          },
        );

        await tx.stockMovement.create({
          data: {
            tenantId, movementNumber, movementType: 'issue', movementDate: new Date(),
            itemId:             line.itemId!,
            fromWarehouseId:    warehouse.id,
            quantity:           new Decimal(allQtys.storageQty),
            uom:                allQtys.storageUom,
            purchaseQty:        allQtys.purchaseQty,
            purchaseUom:        allQtys.purchaseUom,
            consumptionQty:     allQtys.consumptionQty,
            consumptionUom:     allQtys.consumptionUom,
            unitCost:           new Decimal(unitCost),
            unitCostAtMovement: new Decimal(unitCost),
            movementValue:      new Decimal(-Math.abs(cogsValue)),
            referenceType:      'ar_invoice',
            referenceId:        arInvoice.id,
            notes:              `AR Shipment — ${arInvoice.invoiceNumber}`,
            createdBy:          userId,
          },
        });

        if (existing) {
          await tx.stock.update({
            where: { id: existing.id },
            data: {
              purchaseQty:    { decrement: new Decimal(allQtys.purchaseQty)    },
              onHandQuantity: { decrement: new Decimal(allQtys.storageQty)     },
              storageQty:     { decrement: new Decimal(allQtys.storageQty)     },
              consumptionQty: { decrement: new Decimal(allQtys.consumptionQty) },
            },
          });
        }
      });
    }
  }

  // ── Ledger ─────────────────────────────────────────────────────────────────

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

    // ── Resolve reference numbers (batch lookup — no N+1) ─────────────────
    const arIds  = [...new Set(filtered.filter(m => m.referenceType === 'ar_invoice'     && m.referenceId).map(m => m.referenceId!))];
    const apIds  = [...new Set(filtered.filter(m => m.referenceType === 'ap_invoice'     && m.referenceId).map(m => m.referenceId!))];
    const poIds  = [...new Set(filtered.filter(m => m.referenceType === 'purchase_order' && m.referenceId).map(m => m.referenceId!))];
    const grnIds = [...new Set(filtered.filter(m =>
      (m.referenceType === 'GRN' || m.referenceType === 'GRN_CANCEL') && m.referenceId
    ).map(m => m.referenceId!))];

    const [arInvoices, apInvoices, poOrders, grnReceipts] = await Promise.all([
      arIds.length  > 0 ? this.prisma.arInvoice.findMany({    where: { id: { in: arIds  } }, select: { id: true, invoiceNumber: true } }) : [],
      apIds.length  > 0 ? this.prisma.apInvoice.findMany({    where: { id: { in: apIds  } }, select: { id: true, invoiceNumber: true } }) : [],
      poIds.length  > 0 ? this.prisma.purchaseOrder.findMany({ where: { id: { in: poIds  } }, select: { id: true, poNumber:      true } }) : [],
      grnIds.length > 0 ? this.prisma.goodsReceipt.findMany({ where: { id: { in: grnIds } }, select: { id: true, grnNumber:     true } }) : [],
    ]);

    const arMap  = new Map<string, string>(arInvoices.map(i  => [i.id, i.invoiceNumber] as [string, string]));
    const apMap  = new Map<string, string>(apInvoices.map(i  => [i.id, i.invoiceNumber] as [string, string]));
    const poMap  = new Map<string, string>((poOrders    as any[]).map(p => [p.id, p.poNumber]  as [string, string]));
    const grnMap = new Map<string, string>((grnReceipts as any[]).map(g => [g.id, g.grnNumber] as [string, string]));

    const resolveRef = (m: any): string => {
      if (!m.referenceType || !m.referenceId)    return '—';
      if (m.referenceType === 'ar_invoice')      return arMap.get(m.referenceId)  ?? m.referenceId;
      if (m.referenceType === 'ap_invoice')      return apMap.get(m.referenceId)  ?? m.referenceId;
      if (m.referenceType === 'purchase_order')  return poMap.get(m.referenceId)  ?? m.referenceId;
      if (m.referenceType === 'GRN')             return grnMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'GRN_CANCEL')      return (grnMap.get(m.referenceId) ?? m.referenceId) + ' (cancel)';
      if (m.referenceType === 'opening_balance') return 'Opening Balance';
      return m.referenceId ?? '—';
    };

    if (filters?.referenceNumber) {
      const q = filters.referenceNumber.toLowerCase();
      filtered = filtered.filter(m => resolveRef(m).toLowerCase().includes(q));
    }

    // ── Running balance ────────────────────────────────────────────────────
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
        balanceMap[key] += m.movementType === 'issue' ? -Number(m.quantity) : Number(m.quantity);
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
        purchaseQty:     m.purchaseQty    ? Number(m.purchaseQty)    : qty,
        purchaseUom:     m.purchaseUom    ?? m.uom,
        consumptionQty:  m.consumptionQty ? Number(m.consumptionQty) : qty,
        consumptionUom:  m.consumptionUom ?? m.uom,
        unitCost,
        movementValue:   m.movementValue  ? Number(m.movementValue)  : (isOut ? -totalValue : totalValue),
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
        netMovement:    Math.round((totalIn - totalOut)           * 1000) / 1000,
        totalInValue:   Math.round(totalInValue   * 100)  / 100,
        totalOutValue:  Math.round(totalOutValue  * 100)  / 100,
        netValue:       Math.round((totalInValue - totalOutValue) * 100)  / 100,
        openingBalance: rows.length > 0 ? rows[0].openingBalance               : 0,
        closingBalance: rows.length > 0 ? rows[rows.length - 1].closingBalance : 0,
      },
      count: rows.length,
    };
  }

  // ── Valuation (ADR-019: purchaseQty × unitCost) ────────────────────────────

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
        const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
        const unitCost    = Number(s.unitCost ?? 0);
        const totalValue  = Math.round(purchaseQty * unitCost * 100) / 100;
        return {
          itemId: s.item.id, itemCode: s.item.code, itemName: s.item.name, itemType: s.item.itemType,
          warehouseId: s.warehouse.id, warehouseCode: s.warehouse.code, warehouseName: s.warehouse.name,
          purchaseQty,
          purchaseUom:    s.purchaseUom || s.item.baseUom,
          unitCost,
          totalValue,
          onHandQuantity: Number(s.storageQty ?? s.onHandQuantity),
          uom:            s.storageUom  || s.item.baseUom,
        };
      });

    return {
      asOf: new Date(),
      rows,
      totalInventoryValue: Math.round(rows.reduce((sum, r) => sum + r.totalValue, 0) * 100) / 100,
      totalItems: rows.length,
    };
  }

  // ── Stock Planning ─────────────────────────────────────────────────────────

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

    const poSupplyMap = new Map<string, {
      totalPending: number;
      orders: Array<{ poNumber: string; pending: number; expectedDate: string | null }>;
    }>();
    for (const line of pendingPOLines) {
      const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      if (pending <= 0 || !line.itemId) continue;
      const ex = poSupplyMap.get(line.itemId) ?? { totalPending: 0, orders: [] };
      ex.totalPending += pending;
      ex.orders.push({ poNumber: line.purchaseOrder.poNumber, pending, expectedDate: line.purchaseOrder.expectedDate?.toISOString().split('T')[0] ?? null });
      poSupplyMap.set(line.itemId, ex);
    }

    const soDemandMap = new Map<string, {
      totalDemand: number;
      orders: Array<{ soNumber: string; demand: number; promisedDate: string | null }>;
    }>();
    for (const line of openSOLines) {
      const demand = Number(line.orderedQuantity) - Number(line.shippedQuantity);
      if (demand <= 0 || !line.itemId) continue;
      const ex = soDemandMap.get(line.itemId) ?? { totalDemand: 0, orders: [] };
      ex.totalDemand += demand;
      ex.orders.push({ soNumber: line.salesOrder.soNumber, demand, promisedDate: line.salesOrder.promisedDate?.toISOString().split('T')[0] ?? null });
      soDemandMap.set(line.itemId, ex);
    }

    const rows = filtered.map(s => {
      const onHand      = Number(s.storageQty ?? s.onHandQuantity);
      const reserved    = Number(s.reservedQuantity);
      const available   = onHand - reserved;
      const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
      const unitCost    = Number(s.unitCost ?? 0);
      const stockValue  = Math.round(purchaseQty * unitCost * 100) / 100;

      const reorderPoint = Number(s.item.reorderPoint   ?? 0);
      const safetyStock  = Number(s.item.safetyStock    ?? 0);
      const reorderQty   = Number(s.item.reorderQuantity ?? 0);
      const leadTimeDays = Number(s.item.leadTimeDays   ?? 0);

      const poData   = poSupplyMap.get(s.itemId);
      const soData   = soDemandMap.get(s.itemId);
      const poSupply = poData?.totalPending ?? 0;
      const soDemand = soData?.totalDemand  ?? 0;
      const atp               = available + poSupply - soDemand;
      const projectedStock    = onHand + poSupply - soDemand;
      const dailyDemand       = soDemand > 0 ? soDemand / 30 : 0;
      const coverageDays      = dailyDemand > 0 ? Math.floor(available / dailyDemand) : available > 0 ? 999 : 0;
      const shortfall         = Math.max(0, reorderPoint + safetyStock - atp);
      const suggestedOrderQty = shortfall > 0 ? Math.max(shortfall, reorderQty) : 0;

      let alertLevel: 'ok' | 'warning' | 'critical' | 'overstock' = 'ok';
      if      (atp < 0)                                        alertLevel = 'critical';
      else if (atp <= safetyStock)                             alertLevel = 'critical';
      else if (atp <= reorderPoint)                            alertLevel = 'warning';
      else if (onHand > reorderPoint * 3 && reorderPoint > 0) alertLevel = 'overstock';

      const hasOpenPO       = poSupply > 0;
      const doubleOrderRisk = atp <= reorderPoint && hasOpenPO;
      const nextReceipt     = poData?.orders
        .filter(o => o.expectedDate)
        .sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))[0]?.expectedDate ?? null;
      const daysUntilReorder = leadTimeDays > 0 && dailyDemand > 0
        ? Math.floor((available - reorderPoint) / dailyDemand) - leadTimeDays
        : null;

      return {
        itemId: s.item.id, itemCode: s.item.code, itemName: s.item.name, itemType: s.item.itemType,
        warehouseId: s.warehouse.id, warehouseCode: s.warehouse.code, warehouseName: s.warehouse.name,
        uom: s.storageUom || s.item.baseUom,
        onHandQty: onHand, reservedQty: reserved, availableQty: available,
        unitCost, stockValue,
        purchaseQty, purchaseUom: s.purchaseUom || s.item.baseUom,
        poSupplyQty:       Math.round(poSupply       * 1000) / 1000,
        soDemandQty:       Math.round(soDemand       * 1000) / 1000,
        atpQty:            Math.round(atp            * 1000) / 1000,
        projectedStockQty: Math.round(projectedStock * 1000) / 1000,
        reorderPoint, safetyStock, reorderQty, leadTimeDays,
        suggestedOrderQty: Math.round(suggestedOrderQty * 1000) / 1000,
        coverageDays:      coverageDays > 900 ? null : coverageDays,
        dailyDemand:       Math.round(dailyDemand * 1000) / 1000,
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
  // ============================================================================
// ADD THESE TWO METHODS to StockTransactionsService
// Place them before the closing brace } of the class
// ============================================================================

  // ── ABC Analysis (ADR-019: value = purchaseQty × unitCost) ────────────────
  // A = top items representing ~80% of total value
  // B = next items representing ~15% of total value
  // C = remaining items representing ~5% of total value

  async getAbcAnalysis(tenantId: string, filters?: { warehouseId?: string; itemType?: string }) {
    const where: any = { tenantId };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: {
        item:      { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ item: { code: 'asc' } }],
    });

    // Aggregate by item (sum across warehouses)
    const itemMap = new Map<string, {
      itemId: string; itemCode: string; itemName: string; itemType: string;
      totalValue: number; totalPurchaseQty: number; unitCost: number;
      warehouses: string[];
    }>();

    for (const s of stock) {
      if (filters?.itemType && s.item.itemType !== filters.itemType) continue;
      const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
      const unitCost    = Number(s.unitCost ?? 0);
      const value       = Math.round(purchaseQty * unitCost * 100) / 100;

      const ex = itemMap.get(s.item.id);
      if (ex) {
        ex.totalValue       += value;
        ex.totalPurchaseQty += purchaseQty;
        ex.warehouses.push(s.warehouse.code);
      } else {
        itemMap.set(s.item.id, {
          itemId:          s.item.id,
          itemCode:        s.item.code,
          itemName:        s.item.name,
          itemType:        s.item.itemType,
          totalValue:      value,
          totalPurchaseQty: purchaseQty,
          unitCost,
          warehouses:      [s.warehouse.code],
        });
      }
    }

    // Sort descending by value
    const sorted = [...itemMap.values()].sort((a, b) => b.totalValue - a.totalValue);
    const grandTotal = sorted.reduce((s, r) => s + r.totalValue, 0);

    // Assign ABC class based on cumulative value %
    let cumulative = 0;
    const rows = sorted.map((item, idx) => {
      cumulative += item.totalValue;
      const cumulativePct = grandTotal > 0 ? (cumulative / grandTotal) * 100 : 0;
      const valuePct      = grandTotal > 0 ? (item.totalValue / grandTotal) * 100 : 0;
      const abcClass      = cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';

      return {
        rank:             idx + 1,
        itemId:           item.itemId,
        itemCode:         item.itemCode,
        itemName:         item.itemName,
        itemType:         item.itemType,
        totalValue:       Math.round(item.totalValue       * 100) / 100,
        totalPurchaseQty: Math.round(item.totalPurchaseQty * 1000) / 1000,
        unitCost:         Math.round(item.unitCost         * 10000) / 10000,
        valuePct:         Math.round(valuePct              * 100) / 100,
        cumulativePct:    Math.round(cumulativePct         * 100) / 100,
        abcClass,
        warehouses:       [...new Set(item.warehouses)],
      };
    });

    const summary = {
      grandTotal:    Math.round(grandTotal * 100) / 100,
      totalItems:    rows.length,
      classA: { count: rows.filter(r => r.abcClass === 'A').length, value: Math.round(rows.filter(r => r.abcClass === 'A').reduce((s, r) => s + r.totalValue, 0) * 100) / 100 },
      classB: { count: rows.filter(r => r.abcClass === 'B').length, value: Math.round(rows.filter(r => r.abcClass === 'B').reduce((s, r) => s + r.totalValue, 0) * 100) / 100 },
      classC: { count: rows.filter(r => r.abcClass === 'C').length, value: Math.round(rows.filter(r => r.abcClass === 'C').reduce((s, r) => s + r.totalValue, 0) * 100) / 100 },
    };

    return { rows, summary, asOf: new Date() };
  }

  // ── Stock Aging ────────────────────────────────────────────────────────────
  // Days since last movement per item/warehouse
  // Buckets: 0-30d (fresh), 31-60d (watch), 61-90d (aging), 91-180d (slow), 180+d (dead)

  async getStockAging(tenantId: string, filters?: { warehouseId?: string; itemType?: string }) {
    const stockWhere: any = { tenantId };
    if (filters?.warehouseId) stockWhere.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        item:      { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    const now = new Date();

    // Get last movement date per item+warehouse in one batch query
    const lastMovements = await this.prisma.stockMovement.groupBy({
      by:      ['itemId', 'fromWarehouseId', 'toWarehouseId'],
      where:   { tenantId },
      _max:    { movementDate: true },
    });

    // Build lookup: itemId:warehouseId → lastMovementDate
    const lastMovMap = new Map<string, Date>();
    for (const m of lastMovements) {
      const date = m._max.movementDate;
      if (!date) continue;
      for (const whId of [m.toWarehouseId, m.fromWarehouseId]) {
        if (!whId) continue;
        const key     = `${m.itemId}:${whId}`;
        const current = lastMovMap.get(key);
        if (!current || date > current) lastMovMap.set(key, date);
      }
    }

    const rows = stock
      .filter(s => !filters?.itemType || s.item.itemType === filters.itemType)
      .map(s => {
        const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
        const storageQty  = Number(s.storageQty  ?? s.onHandQuantity);
        const unitCost    = Number(s.unitCost ?? 0);
        const totalValue  = Math.round(purchaseQty * unitCost * 100) / 100;

        const key          = `${s.itemId}:${s.warehouseId}`;
        const lastMovDate  = lastMovMap.get(key) ?? null;
        const daysSinceLastMovement = lastMovDate
          ? Math.floor((now.getTime() - lastMovDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Aging bucket
        let agingBucket: '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'no_movement';
        if (daysSinceLastMovement === null)       agingBucket = 'no_movement';
        else if (daysSinceLastMovement <= 30)     agingBucket = '0-30';
        else if (daysSinceLastMovement <= 60)     agingBucket = '31-60';
        else if (daysSinceLastMovement <= 90)     agingBucket = '61-90';
        else if (daysSinceLastMovement <= 180)    agingBucket = '91-180';
        else                                      agingBucket = '180+';

        const isSlowMoving = daysSinceLastMovement !== null && daysSinceLastMovement > 60;
        const isDead       = daysSinceLastMovement !== null && daysSinceLastMovement > 180;

        return {
          itemId:               s.item.id,
          itemCode:             s.item.code,
          itemName:             s.item.name,
          itemType:             s.item.itemType,
          warehouseId:          s.warehouse.id,
          warehouseCode:        s.warehouse.code,
          warehouseName:        s.warehouse.name,
          purchaseQty:          Math.round(purchaseQty * 1000) / 1000,
          storageQty:           Math.round(storageQty  * 1000) / 1000,
          uom:                  s.storageUom  || s.item.baseUom,
          purchaseUom:          s.purchaseUom || s.item.baseUom,
          unitCost,
          totalValue,
          lastMovementDate:     lastMovDate?.toISOString() ?? null,
          daysSinceLastMovement,
          agingBucket,
          isSlowMoving,
          isDead,
        };
      })
      .sort((a, b) => {
        // Sort: no_movement first, then by days desc
        if (a.daysSinceLastMovement === null) return -1;
        if (b.daysSinceLastMovement === null) return 1;
        return b.daysSinceLastMovement - a.daysSinceLastMovement;
      });

    const bucketSummary = {
      'no_movement': { count: 0, value: 0 },
      '0-30':        { count: 0, value: 0 },
      '31-60':       { count: 0, value: 0 },
      '61-90':       { count: 0, value: 0 },
      '91-180':      { count: 0, value: 0 },
      '180+':        { count: 0, value: 0 },
    };
    for (const r of rows) {
      bucketSummary[r.agingBucket].count++;
      bucketSummary[r.agingBucket].value = Math.round((bucketSummary[r.agingBucket].value + r.totalValue) * 100) / 100;
    }

    return {
      rows,
      summary: {
        totalItems:      rows.length,
        totalValue:      Math.round(rows.reduce((s, r) => s + r.totalValue, 0) * 100) / 100,
        slowMovingCount: rows.filter(r => r.isSlowMoving).length,
        slowMovingValue: Math.round(rows.filter(r => r.isSlowMoving).reduce((s, r) => s + r.totalValue, 0) * 100) / 100,
        deadStockCount:  rows.filter(r => r.isDead).length,
        deadStockValue:  Math.round(rows.filter(r => r.isDead).reduce((s, r) => s + r.totalValue, 0) * 100) / 100,
        buckets:         bucketSummary,
      },
      asOf: new Date(),
    };
  }
}