import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class StockTransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createStockTransactionDto: CreateStockTransactionDto) {
    // Verify item exists
    const item = await this.prisma.item.findFirst({
      where: {
        id: createStockTransactionDto.itemId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Verify warehouse exists
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id: createStockTransactionDto.warehouseId,
        tenantId,
        deletedAt: null,
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    // Generate movement number
    const movementNumber = await this.generateMovementNumber(tenantId);

    // Create transaction and update stock
    const result = await this.prisma.$transaction(async (tx) => {
      // Determine from/to warehouses based on movement type
      const isReceipt = createStockTransactionDto.transactionType === 'receipt';
      const isIssue = createStockTransactionDto.transactionType === 'issue';

      // Create stock movement
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          movementNumber,
          movementType: createStockTransactionDto.transactionType,
          movementDate: createStockTransactionDto.transactionDate 
            ? new Date(createStockTransactionDto.transactionDate)
            : new Date(),
          itemId: createStockTransactionDto.itemId,
          fromWarehouseId: isIssue ? createStockTransactionDto.warehouseId : null,
          toWarehouseId: isReceipt ? createStockTransactionDto.warehouseId : null,
          quantity: new Decimal(Math.abs(createStockTransactionDto.quantity)),
          uom: createStockTransactionDto.uom,
          lotNumber: createStockTransactionDto.lotNumber,
          serialNumber: createStockTransactionDto.serialNumber,
          referenceType: createStockTransactionDto.referenceType,
          referenceId: createStockTransactionDto.referenceId,
          notes: createStockTransactionDto.notes,
          createdBy: userId,
        },
      });

      // Update stock record
      const existingStock = await tx.stock.findFirst({
        where: {
          tenantId,
          itemId: createStockTransactionDto.itemId,
          warehouseId: createStockTransactionDto.warehouseId,
        },
      });

      if (existingStock) {
        const newQuantity = existingStock.onHandQuantity.toNumber() + createStockTransactionDto.quantity;
        await tx.stock.update({
          where: { id: existingStock.id },
          data: {
            onHandQuantity: new Decimal(newQuantity),
          },
        });
      } else {
        await tx.stock.create({
          data: {
            tenantId,
            itemId: createStockTransactionDto.itemId,
            warehouseId: createStockTransactionDto.warehouseId,
            onHandQuantity: new Decimal(Math.max(0, createStockTransactionDto.quantity)),
            reservedQuantity: new Decimal(0),
            unitCost: new Decimal(0),
            lotNumber: createStockTransactionDto.lotNumber,
            serialNumber: createStockTransactionDto.serialNumber,
          },
        });
      }

      return movement;
    });

    return this.findOne(tenantId, result.id);
  }

  async findAll(tenantId: string, filters?: {
    itemId?: string;
    warehouseId?: string;
    transactionType?: string;
  }) {
    const where: any = {
      tenantId,
    };

    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.transactionType) where.movementType = filters.transactionType;

    return this.prisma.stockMovement.findMany({
      where,
      include: {
        item: true,
        fromWarehouse: true,
      },
      orderBy: {
        movementDate: 'desc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const movement = await this.prisma.stockMovement.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        item: true,
        fromWarehouse: true,
      },
    });

    if (!movement) {
      throw new NotFoundException(`Stock movement with ID ${id} not found`);
    }

    return {
      ...movement,
      quantity: movement.quantity.toNumber(),
    };
  }

  async getStockBalance(tenantId: string, filters?: {
    itemId?: string;
    warehouseId?: string;
  }) {
    const where: any = {
      tenantId,
    };

    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: {
        item: true,
        warehouse: true,
      },
      orderBy: [
        { item: { code: 'asc' } },
        { warehouse: { code: 'asc' } },
      ],
    });

    return stock.map(s => ({
      ...s,
      onHandQuantity: s.onHandQuantity.toNumber(),
      reservedQuantity: s.reservedQuantity.toNumber(),
      unitCost: s.unitCost.toNumber(),
    }));
  }

  private async generateMovementNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SM-${year}`;

    const lastMovement = await this.prisma.stockMovement.findFirst({
      where: {
        tenantId,
        movementNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        movementNumber: 'desc',
      },
    });

    if (!lastMovement) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(lastMovement.movementNumber.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}-${nextNumber}`;
  }

  // ============================================================================
  // INTERNAL — called by AP and AR services automatically
  // ============================================================================

  /**
   * Stock IN from AP Invoice post.
   * Creates one StockMovement per invoice line and recalculates WAC.
   * Uses default warehouse (first active warehouse of tenant).
   */
  async receiveFromApInvoice(
    tenantId: string,
    userId: string,
    apInvoice: {
      id: string;
      invoiceNumber: string;
      lines: Array<{
        itemId: string | null;
        quantity: number;
        uom: string | null;
        unitPrice: number;
        description: string | null;
      }>;
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
        // Create stock movement
        await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber,
            movementType:   'receipt',
            movementDate:   new Date(),
            itemId:         line.itemId!,
            toWarehouseId:  warehouse.id,
            quantity:       new Decimal(line.quantity),
            uom:            line.uom ?? item.baseUom,
            unitCost:       new Decimal(line.unitPrice),
            referenceType:  'ap_invoice',
            referenceId:    apInvoice.id,
            notes:          `AP Receipt — ${apInvoice.invoiceNumber}`,
            createdBy:      userId,
          },
        });

        // WAC recalculation
        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId!, warehouseId: warehouse.id },
        });

        if (existing) {
          const oldQty   = Number(existing.onHandQuantity);
          const oldCost  = Number(existing.unitCost ?? 0);
          const newQty   = line.quantity;
          const newCost  = line.unitPrice;
          const totalQty = oldQty + newQty;

          // Weighted average: (oldQty × oldCost + newQty × newCost) / totalQty
          const wac = totalQty > 0
            ? (oldQty * oldCost + newQty * newCost) / totalQty
            : newCost;

          await tx.stock.update({
            where: { id: existing.id },
            data: {
              onHandQuantity: new Decimal(totalQty),
              unitCost:       new Decimal(Math.round(wac * 10000) / 10000),
            },
          });
        } else {
          await tx.stock.create({
            data: {
              tenantId,
              itemId:          line.itemId!,
              warehouseId:     warehouse.id,
              onHandQuantity:  new Decimal(line.quantity),
              reservedQuantity: new Decimal(0),
              unitCost:        new Decimal(line.unitPrice),
            },
          });
        }
      });
    }
  }

  /**
   * Stock OUT from AR Invoice send.
   * Creates one StockMovement per invoice line (finished goods).
   * Uses WAC unit cost from in_stock at time of shipment.
   */
  async shipFromArInvoice(
    tenantId: string,
    userId: string,
    arInvoice: {
      id: string;
      invoiceNumber: string;
      lines: Array<{
        itemId: string | null;
        quantity: number;
        uom: string | null;
        description: string | null;
      }>;
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

        // Create stock movement (negative = OUT)
        await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber,
            movementType:     'issue',
            movementDate:     new Date(),
            itemId:           line.itemId!,
            fromWarehouseId:  warehouse.id,
            quantity:         new Decimal(line.quantity),
            uom:              line.uom ?? item.baseUom,
            unitCost:         new Decimal(unitCost),
            referenceType:    'ar_invoice',
            referenceId:      arInvoice.id,
            notes:            `AR Shipment — ${arInvoice.invoiceNumber}`,
            createdBy:        userId,
          },
        });

        // Reduce stock (floor at 0 — negative stock not allowed)
        if (existing) {
          const newQty = Math.max(0, Number(existing.onHandQuantity) - line.quantity);
          await tx.stock.update({
            where: { id: existing.id },
            data: { onHandQuantity: new Decimal(newQty) },
          });
        }
      });
    }
  }

  // ============================================================================
  // LEDGER — enriched stock movement report with running balance
  // ============================================================================

  async getLedger(tenantId: string, filters?: {
    itemId?:         string;
    warehouseId?:    string;
    itemType?:       string;
    movementType?:   string;
    referenceNumber?: string;
    dateFrom?:       string;
    dateTo?:         string;
  }) {
    const where: any = { tenantId };

    if (filters?.itemId)       where.itemId      = filters.itemId;
    if (filters?.movementType) where.movementType = filters.movementType;

    // Warehouse filter — check both from and to
    if (filters?.warehouseId) {
      where.OR = [
        { fromWarehouseId: filters.warehouseId },
        { toWarehouseId:   filters.warehouseId },
      ];
    }

    // Date range
    if (filters?.dateFrom || filters?.dateTo) {
      where.movementDate = {};
      if (filters.dateFrom) where.movementDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo)   where.movementDate.lte = new Date(filters.dateTo + 'T23:59:59Z');
    }

    // Item type filter via item relation
    const itemWhere: any = { tenantId, deletedAt: null };
    if (filters?.itemType) itemWhere.itemType = filters.itemType;

    const movements = await this.prisma.stockMovement.findMany({
      where,
      include: {
        item:          { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        fromWarehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { movementDate: 'asc' },
    });

    // Apply itemType filter in memory (Prisma nested where on include)
    let filtered = movements.filter(m =>
      !filters?.itemType || m.item?.itemType === filters.itemType
    );

    // ── Resolve reference numbers ────────────────────────────────────────────
    // Batch lookup by referenceType to avoid N+1
    const arIds  = [...new Set(filtered.filter(m => m.referenceType === 'ar_invoice' && m.referenceId).map(m => m.referenceId!))];
    const apIds  = [...new Set(filtered.filter(m => m.referenceType === 'ap_invoice' && m.referenceId).map(m => m.referenceId!))];

    const [arInvoices, apInvoices] = await Promise.all([
      arIds.length > 0
        ? this.prisma.arInvoice.findMany({ where: { id: { in: arIds } }, select: { id: true, invoiceNumber: true } })
        : [],
      apIds.length > 0
        ? this.prisma.apInvoice.findMany({ where: { id: { in: apIds } }, select: { id: true, invoiceNumber: true } })
        : [],
    ]);

    const arMap = new Map<string, string>(arInvoices.map(i => [i.id, i.invoiceNumber] as [string, string]));
    const apMap = new Map<string, string>(apInvoices.map(i => [i.id, i.invoiceNumber] as [string, string]));

    const resolveRef = (m: any): string => {
      if (!m.referenceType || !m.referenceId) return '—';
      if (m.referenceType === 'ar_invoice')    return arMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'ap_invoice')    return apMap.get(m.referenceId) ?? m.referenceId;
      if (m.referenceType === 'opening_balance') return 'Opening Balance';
      return m.referenceId ?? '—';
    };

    // ── Filter by referenceNumber if provided ────────────────────────────────
    if (filters?.referenceNumber) {
      const q = filters.referenceNumber.toLowerCase();
      filtered = filtered.filter(m => resolveRef(m).toLowerCase().includes(q));
    }

    // ── Calculate running balance per item/warehouse ──────────────────────────
    // Build running balance map: key = itemId:warehouseId
    const balanceMap: Record<string, number> = {};

    // Get opening balances BEFORE dateFrom for each item/warehouse combo
    if (filters?.dateFrom) {
      const beforeMovements = await this.prisma.stockMovement.findMany({
        where: {
          tenantId,
          ...(filters.itemId       ? { itemId: filters.itemId } : {}),
          ...(filters.warehouseId  ? { OR: [{ fromWarehouseId: filters.warehouseId }, { toWarehouseId: filters.warehouseId }] } : {}),
          movementDate: { lt: new Date(filters.dateFrom) },
        },
        select: { itemId: true, fromWarehouseId: true, toWarehouseId: true, movementType: true, quantity: true },
      });

      for (const m of beforeMovements) {
        const whId = m.toWarehouseId ?? m.fromWarehouseId ?? 'unknown';
        const key  = `${m.itemId}:${whId}`;
        if (!balanceMap[key]) balanceMap[key] = 0;
        const isOut = ['issue'].includes(m.movementType);
        balanceMap[key] += isOut ? -Number(m.quantity) : Number(m.quantity);
      }
    }

    // Build ledger rows with running balance
    const rows = filtered.map(m => {
      const whId       = m.toWarehouseId ?? m.fromWarehouseId ?? 'unknown';
      const key        = `${m.itemId}:${whId}`;
      const isOut      = ['issue'].includes(m.movementType);
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
        warehouse:       m.fromWarehouse ?? null,
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

    // ── Totals ───────────────────────────────────────────────────────────────
    const totalIn       = rows.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.quantity,    0);
    const totalOut      = rows.filter(r => r.signedQuantity < 0).reduce((s, r) => s + r.quantity,    0);
    const totalInValue  = rows.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.totalValue,  0);
    const totalOutValue = rows.filter(r => r.signedQuantity < 0).reduce((s, r) => s + Math.abs(r.totalValue), 0);

    return {
      rows,
      totals: {
        totalIn:        Math.round(totalIn * 1000) / 1000,
        totalOut:       Math.round(totalOut * 1000) / 1000,
        netMovement:    Math.round((totalIn - totalOut) * 1000) / 1000,
        totalInValue:   Math.round(totalInValue * 100) / 100,
        totalOutValue:  Math.round(totalOutValue * 100) / 100,
        netValue:       Math.round((totalInValue - totalOutValue) * 100) / 100,
        openingBalance: rows.length > 0 ? rows[0].openingBalance : 0,
        closingBalance: rows.length > 0 ? rows[rows.length - 1].closingBalance : 0,
      },
      count: rows.length,
    };
  }

  /**
   * Inventory valuation report.  /**
   * Inventory valuation report.
   * Returns onHandQuantity × unitCost per item/warehouse.
   */
  async getValuation(tenantId: string, filters?: { warehouseId?: string; itemType?: string }) {
    const where: any = { tenantId };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const stock = await this.prisma.stock.findMany({
      where,
      include: {
        item:      { select: { id: true, code: true, name: true, itemType: true, baseUom: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [
        { item: { code: 'asc' } },
        { warehouse: { code: 'asc' } },
      ],
    });

    const rows = stock
      .filter(s => !filters?.itemType || s.item.itemType === filters.itemType)
      .map(s => {
        const onHand    = Number(s.onHandQuantity);
        const unitCost  = Number(s.unitCost ?? 0);
        const totalValue = Math.round(onHand * unitCost * 100) / 100;
        return {
          itemId:        s.item.id,
          itemCode:      s.item.code,
          itemName:      s.item.name,
          itemType:      s.item.itemType,
          warehouseId:   s.warehouse.id,
          warehouseCode: s.warehouse.code,
          warehouseName: s.warehouse.name,
          onHandQuantity: onHand,
          unitCost,
          totalValue,
          uom:           s.item.baseUom,
        };
      });

    const totalInventoryValue = rows.reduce((sum, r) => sum + r.totalValue, 0);

    return {
      asOf:                new Date(),
      rows,
      totalInventoryValue: Math.round(totalInventoryValue * 100) / 100,
      totalItems:          rows.length,
    };
  }
  // ============================================================================
  // STOCK PLANNING — ATP (Available to Promise) with rupture alerts
  // ============================================================================

  async getStockPlanning(tenantId: string, filters?: {
    warehouseId?: string;
    itemType?: string;
    alertOnly?: boolean;
  }) {
    // 1. Get all active stock positions
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

    // Apply itemType filter
    const filtered = stockPositions.filter(s =>
      !filters?.itemType || s.item.itemType === filters.itemType
    );

    // 2. Get all pending PO lines (confirmed/approved, not fully received)
    const pendingPOLines = await this.prisma.purchaseOrderLine.findMany({
      where: {
        tenantId,
        purchaseOrder: {
          tenantId,
          status: { in: ['confirmed', 'approved', 'sent'] },
          deletedAt: null,
        },
      },
      include: {
        purchaseOrder: {
          select: { id: true, poNumber: true, status: true, expectedDate: true },
        },
      },
    });

    // 3. Get all open SO lines (confirmed/shipped, not fully shipped)
    const openSOLines = await this.prisma.salesOrderLine.findMany({
      where: {
        tenantId,
        salesOrder: {
          tenantId,
          status: { in: ['confirmed', 'shipped'] },
          deletedAt: null,
        },
        deletedAt: null,
      },
      include: {
        salesOrder: {
          select: { id: true, soNumber: true, status: true, promisedDate: true },
        },
      },
    });

    // 4. Build lookup maps
    // PO supply by itemId: sum of (orderedQty - receivedQty) per item
    const poSupplyMap = new Map<string, {
      totalPending: number;
      orders: Array<{ poNumber: string; pending: number; expectedDate: string | null }>;
    }>();

    for (const line of pendingPOLines) {
      const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      if (pending <= 0 || !line.itemId) continue;

      const existing = poSupplyMap.get(line.itemId) ?? { totalPending: 0, orders: [] };
      existing.totalPending += pending;
      existing.orders.push({
        poNumber: line.purchaseOrder.poNumber,
        pending,
        expectedDate: line.purchaseOrder.expectedDate
          ? line.purchaseOrder.expectedDate.toISOString().split('T')[0]
          : null,
      });
      poSupplyMap.set(line.itemId, existing);
    }

    // SO demand by itemId: sum of (orderedQty - shippedQty) per item
    const soDemandMap = new Map<string, {
      totalDemand: number;
      orders: Array<{ soNumber: string; demand: number; promisedDate: string | null }>;
    }>();

    for (const line of openSOLines) {
      const demand = Number(line.orderedQuantity) - Number(line.shippedQuantity);
      if (demand <= 0 || !line.itemId) continue;

      const existing = soDemandMap.get(line.itemId) ?? { totalDemand: 0, orders: [] };
      existing.totalDemand += demand;
      existing.orders.push({
        soNumber: line.salesOrder.soNumber,
        demand,
        promisedDate: line.salesOrder.promisedDate
          ? line.salesOrder.promisedDate.toISOString().split('T')[0]
          : null,
      });
      soDemandMap.set(line.itemId, existing);
    }

    // 5. Calculate ATP and alerts per stock position
    const now = new Date();

    const rows = filtered.map(s => {
      const onHand    = Number(s.onHandQuantity);
      const reserved  = Number(s.reservedQuantity);
      const available = onHand - reserved;
      const unitCost  = Number(s.unitCost ?? 0);

      const reorderPoint    = Number(s.item.reorderPoint ?? 0);
      const safetyStock     = Number(s.item.safetyStock ?? 0);
      const reorderQty      = Number(s.item.reorderQuantity ?? 0);
      const leadTimeDays    = Number(s.item.leadTimeDays ?? 0);

      const poData   = poSupplyMap.get(s.itemId);
      const soData   = soDemandMap.get(s.itemId);

      const poSupply   = poData?.totalPending ?? 0;
      const soDemand   = soData?.totalDemand  ?? 0;

      // ATP = available + incoming POs - committed SOs
      const atp = available + poSupply - soDemand;

      // Projected stock (without safety stock consideration)
      const projectedStock = onHand + poSupply - soDemand;

      // Coverage in days: available ÷ daily demand
      // Estimate daily demand from SO demand over next 30 days
      const dailyDemand = soDemand > 0 ? soDemand / 30 : 0;
      const coverageDays = dailyDemand > 0
        ? Math.floor(available / dailyDemand)
        : available > 0 ? 999 : 0;

      // Reorder value: how much to order
      const shortfall = Math.max(0, reorderPoint + safetyStock - atp);
      const suggestedOrderQty = shortfall > 0
        ? Math.max(shortfall, reorderQty)
        : 0;

      // Alert level
      let alertLevel: 'ok' | 'warning' | 'critical' | 'overstock' = 'ok';
      if (atp < 0) {
        alertLevel = 'critical';  // Already in deficit
      } else if (atp <= safetyStock) {
        alertLevel = 'critical';  // Below safety stock
      } else if (atp <= reorderPoint) {
        alertLevel = 'warning';   // Below reorder point but above safety
      } else if (onHand > reorderPoint * 3 && reorderPoint > 0) {
        alertLevel = 'overstock'; // More than 3x reorder point
      }

      // Double-order risk: below reorder point BUT PO already placed
      const hasOpenPO = poSupply > 0;
      const doubleOrderRisk = atp <= reorderPoint && hasOpenPO;

      // Next expected receipt date
      const nextReceipt = poData?.orders
        .filter(o => o.expectedDate)
        .sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))[0]
        ?.expectedDate ?? null;

      // Days until reorder needed (based on lead time)
      const daysUntilReorder = leadTimeDays > 0 && dailyDemand > 0
        ? Math.floor((available - reorderPoint) / dailyDemand) - leadTimeDays
        : null;

      return {
        itemId:        s.item.id,
        itemCode:      s.item.code,
        itemName:      s.item.name,
        itemType:      s.item.itemType,
        warehouseId:   s.warehouse.id,
        warehouseCode: s.warehouse.code,
        warehouseName: s.warehouse.name,
        uom:           s.item.baseUom,

        // Stock positions
        onHandQty:     onHand,
        reservedQty:   reserved,
        availableQty:  available,
        unitCost,
        stockValue:    Math.round(onHand * unitCost * 100) / 100,

        // Supply & demand
        poSupplyQty:   Math.round(poSupply * 1000) / 1000,
        soDemandQty:   Math.round(soDemand * 1000) / 1000,

        // ATP & projection
        atpQty:            Math.round(atp * 1000) / 1000,
        projectedStockQty: Math.round(projectedStock * 1000) / 1000,

        // Planning parameters
        reorderPoint,
        safetyStock,
        reorderQty,
        leadTimeDays,
        suggestedOrderQty: Math.round(suggestedOrderQty * 1000) / 1000,

        // Coverage
        coverageDays:       coverageDays > 900 ? null : coverageDays,
        dailyDemand:        Math.round(dailyDemand * 1000) / 1000,
        daysUntilReorder,

        // Alerts
        alertLevel,
        hasOpenPO,
        doubleOrderRisk,
        nextReceiptDate: nextReceipt,

        // Detail
        openPOs:   poData?.orders  ?? [],
        openSOs:   soData?.orders  ?? [],
      };
    });

    // Apply alertOnly filter
    const result = filters?.alertOnly
      ? rows.filter(r => r.alertLevel !== 'ok')
      : rows;

    // Summary
    const summary = {
      total:     result.length,
      critical:  result.filter(r => r.alertLevel === 'critical').length,
      warning:   result.filter(r => r.alertLevel === 'warning').length,
      overstock: result.filter(r => r.alertLevel === 'overstock').length,
      ok:        result.filter(r => r.alertLevel === 'ok').length,
      doubleOrderRisk: result.filter(r => r.doubleOrderRisk).length,
      totalStockValue: Math.round(result.reduce((s, r) => s + r.stockValue, 0) * 100) / 100,
    };

    return { rows: result, summary };
  }
}
