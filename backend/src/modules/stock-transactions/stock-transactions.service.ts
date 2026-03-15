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
}
