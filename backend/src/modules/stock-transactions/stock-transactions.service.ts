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

  /**
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
}
