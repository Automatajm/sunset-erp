// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-reconciliation.service.ts
// ============================================================================
import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService }      from '../../database/prisma.service';
import { UomService }         from '../uom/uom.service';
import { Decimal }            from '@prisma/client/runtime/library';
import { CreateSessionDto }   from './dto/create-session.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import { ApproveSessionDto }  from './dto/approve-session.dto';

@Injectable()
export class StockReconciliationService {
  constructor(
    private prisma: PrismaService,
    private uom:    UomService,
  ) {}

  // ── Number generator ────────────────────────────────────────────────────────

  private async generateSessionNumber(tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `CC-${year}`;
    const last   = await this.prisma.stockCountSession.findFirst({
      where:   { tenantId, sessionNumber: { startsWith: prefix } },
      orderBy: { sessionNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.sessionNumber.split('-')[2]);
    return `${prefix}-${(n + 1).toString().padStart(4, '0')}`;
  }

  // ── List sessions ───────────────────────────────────────────────────────────

  async findAll(tenantId: string, filters?: { warehouseId?: string; status?: string }) {
    const where: any = { tenantId, deletedAt: null };
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.status)      where.status      = filters.status;

    return this.prisma.stockCountSession.findMany({
      where,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        _count:    { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get session with lines ──────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const session = await this.prisma.stockCountSession.findFirst({
      where:   { id, tenantId, deletedAt: null },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        lines: {
          where:   { deletedAt: null },
          include: {
            item: {
              select: {
                id: true, code: true, name: true, itemType: true, baseUom: true,
                purchaseUom:    { select: { code: true, name: true } },
                storageUom:     { select: { code: true, name: true } },
                consumptionUom: { select: { code: true, name: true } },
              },
            },
          },
          orderBy: { item: { code: 'asc' } },
        },
      },
    });
    if (!session) throw new NotFoundException('Count session not found');

    // Serialize Decimal fields
    return {
      ...session,
      totalVarianceValue: session.totalVarianceValue ? Number(session.totalVarianceValue) : null,
      lines: session.lines.map(l => ({
        ...l,
        systemStorageQty:   Number(l.systemStorageQty),
        systemPurchaseQty:  Number(l.systemPurchaseQty),
        unitCostSnapshot:   Number(l.unitCostSnapshot),
        countedStorageQty:  l.countedStorageQty  ? Number(l.countedStorageQty)  : null,
        countedPurchaseQty: l.countedPurchaseQty ? Number(l.countedPurchaseQty) : null,
        varianceStorageQty: l.varianceStorageQty ? Number(l.varianceStorageQty) : null,
        variancePurchaseQty:l.variancePurchaseQty? Number(l.variancePurchaseQty): null,
        varianceValue:      l.varianceValue      ? Number(l.varianceValue)      : null,
      })),
    };
  }

  // ── Create session (draft) ──────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSessionDto) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const sessionNumber = await this.generateSessionNumber(tenantId);

    // Get stock positions to snapshot
    const stockWhere: any = { tenantId, warehouseId: dto.warehouseId };
    if (dto.itemIds?.length) stockWhere.itemId = { in: dto.itemIds };

    const stockPositions = await this.prisma.stock.findMany({
      where:   stockWhere,
      include: { item: { select: { id: true, baseUom: true } } },
    });

    const session = await this.prisma.stockCountSession.create({
      data: {
        tenantId,
        sessionNumber,
        warehouseId: dto.warehouseId,
        description: dto.description,
        countDate:   dto.countDate ? new Date(dto.countDate) : new Date(),
        status:      'draft',
        notes:       dto.notes,
        createdBy:   userId,
        updatedBy:   userId,
        lines: {
          create: stockPositions.map(s => {
            const purchaseQty = Number(s.purchaseQty ?? s.onHandQuantity);
            const storageQty  = Number(s.storageQty  ?? s.onHandQuantity);
            const unitCost    = Number(s.unitCost ?? 0);
            return {
              tenantId,
              itemId:            s.itemId,
              systemStorageQty:  new Decimal(storageQty),
              storageUom:        s.storageUom || s.item.baseUom,
              systemPurchaseQty: new Decimal(purchaseQty),
              purchaseUom:       s.purchaseUom || s.item.baseUom,
              unitCostSnapshot:  new Decimal(unitCost),
              lotNumber:         s.lotNumber,
              serialNumber:      s.serialNumber,
              status:            'pending',
              createdBy:         userId,
              updatedBy:         userId,
            };
          }),
        },
      },
    });

    return this.findOne(tenantId, session.id);
  }

  // ── Start session (draft → in_progress) ────────────────────────────────────

  async startSession(tenantId: string, userId: string, id: string) {
    const session = await this.prisma.stockCountSession.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (session.status !== 'draft') throw new BadRequestException(`Session is "${session.status}" — can only start a draft session`);

    await this.prisma.stockCountSession.update({
      where: { id },
      data:  { status: 'in_progress', updatedBy: userId },
    });

    return this.findOne(tenantId, id);
  }

  // ── Enter count for a line ─────────────────────────────────────────────────
  // User enters EITHER countedStorageQty OR countedPurchaseQty
  // System auto-converts the other via UomService
  // Mutual exclusion enforced: last one entered wins

  async updateLine(tenantId: string, userId: string, sessionId: string, dto: UpdateCountLineDto) {
    const session = await this.prisma.stockCountSession.findFirst({
      where: { id: sessionId, tenantId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (!['in_progress'].includes(session.status)) {
      throw new BadRequestException(`Cannot update lines — session is "${session.status}"`);
    }

    const line = await this.prisma.stockCountLine.findFirst({
      where: { id: dto.lineId, sessionId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException('Count line not found');

    if (dto.countedStorageQty === undefined && dto.countedPurchaseQty === undefined) {
      throw new BadRequestException('Provide either countedStorageQty or countedPurchaseQty');
    }

    // Get item conversion factors for manual calculation
    const item = await this.prisma.item.findFirst({
      where: { id: line.itemId, tenantId },
      select: { storageToConsumptionFactor: true, purchaseToConsumptionFactor: true },
    });
    const storageFactor  = Number(item?.storageToConsumptionFactor  ?? 1);
    const purchaseFactor = Number(item?.purchaseToConsumptionFactor ?? 1);
    // storageQty × storageFactor = consumptionQty
    // purchaseQty × purchaseFactor = consumptionQty
    // → storageQty = purchaseQty × (purchaseFactor / storageFactor)
    // → purchaseQty = storageQty × (storageFactor / purchaseFactor)

    let countedStorageQty:  number;
    let countedPurchaseQty: number;

    if (dto.countedStorageQty !== undefined) {
      // User entered storage → derive purchase
      countedStorageQty  = dto.countedStorageQty;
      countedPurchaseQty = storageFactor > 0 && purchaseFactor > 0
        ? Math.round(countedStorageQty * (storageFactor / purchaseFactor) * 1000) / 1000
        : countedStorageQty;
    } else {
      // User entered purchase → derive storage
      countedPurchaseQty = dto.countedPurchaseQty!;
      countedStorageQty  = storageFactor > 0 && purchaseFactor > 0
        ? Math.round(countedPurchaseQty * (purchaseFactor / storageFactor) * 1000) / 1000
        : countedPurchaseQty;
    }

    // Calculate variances
    const varianceStorageQty  = Math.round((countedStorageQty  - Number(line.systemStorageQty))  * 1000) / 1000;
    const variancePurchaseQty = Math.round((countedPurchaseQty - Number(line.systemPurchaseQty)) * 1000) / 1000;
    const varianceValue       = Math.round(variancePurchaseQty * Number(line.unitCostSnapshot) * 100) / 100;

    await this.prisma.stockCountLine.update({
      where: { id: dto.lineId },
      data:  {
        countedStorageQty:   new Decimal(countedStorageQty),
        countedPurchaseQty:  new Decimal(countedPurchaseQty),
        varianceStorageQty:  new Decimal(varianceStorageQty),
        variancePurchaseQty: new Decimal(variancePurchaseQty),
        varianceValue:       new Decimal(varianceValue),
        status:              'counted',
        notes:               dto.notes,
        updatedBy:           userId,
      },
    });

    return this.findOne(tenantId, sessionId);
  }

  // ── Submit for approval (in_progress → pending_approval) ──────────────────

  async submitForApproval(tenantId: string, userId: string, id: string) {
    const session = await this.prisma.stockCountSession.findFirst({
      where:   { id, tenantId, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (session.status !== 'in_progress') {
      throw new BadRequestException(`Session is "${session.status}" — must be in_progress to submit`);
    }

    const uncounted = session.lines.filter(l => l.status === 'pending').length;
    if (uncounted > 0) {
      throw new BadRequestException(`${uncounted} line(s) have not been counted yet`);
    }

    // Calculate summary
    const linesWithVariance = session.lines.filter(l => Number(l.variancePurchaseQty ?? 0) !== 0).length;
    const totalVarianceValue = session.lines.reduce((s, l) => s + Number(l.varianceValue ?? 0), 0);

    await this.prisma.stockCountSession.update({
      where: { id },
      data:  {
        status:             'pending_approval',
        linesWithVariance,
        totalLinesCount:    session.lines.length,
        totalVarianceValue: new Decimal(Math.round(totalVarianceValue * 100) / 100),
        updatedBy:          userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Approve session (pending_approval → approved) ─────────────────────────
  // Requires INVENTORY:APPROVE permission — checked in controller

  async approve(tenantId: string, userId: string, id: string, dto: ApproveSessionDto) {
    const session = await this.prisma.stockCountSession.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (session.status !== 'pending_approval') {
      throw new BadRequestException(`Session is "${session.status}" — must be pending_approval to approve`);
    }

    await this.prisma.stockCountSession.update({
      where: { id },
      data:  {
        status:        'approved',
        approvedBy:    userId,
        approvedAt:    new Date(),
        approvalNotes: dto.approvalNotes,
        updatedBy:     userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Post adjustments (approved → posted) ───────────────────────────────────
  // Creates stock adjustment movements for lines with variance
  // Requires INVENTORY:APPROVE permission

  async post(tenantId: string, userId: string, id: string) {
    const session = await this.prisma.stockCountSession.findFirst({
      where:   { id, tenantId, deletedAt: null },
      include: {
        lines: {
          where:   { deletedAt: null },
          include: { item: true },
        },
        warehouse: true,
      },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (session.status !== 'approved') {
      throw new BadRequestException(`Session is "${session.status}" — must be approved to post`);
    }

    // Only post lines with variance
    const linesWithVariance = session.lines.filter(l => Number(l.variancePurchaseQty ?? 0) !== 0);

    await this.prisma.$transaction(async (tx) => {
      for (const line of linesWithVariance) {
        const variancePurchaseQty = Number(line.variancePurchaseQty ?? 0);
        const varianceStorageQty  = Number(line.varianceStorageQty  ?? 0);
        const unitCost            = Number(line.unitCostSnapshot);
        const movementValue       = Math.round(variancePurchaseQty * unitCost * 100) / 100;
        const isPositive          = variancePurchaseQty > 0;

        // Generate movement number
        const year   = new Date().getFullYear();
        const prefix = `SM-${year}`;
        const last   = await tx.stockMovement.findFirst({
          where:   { tenantId, movementNumber: { startsWith: prefix } },
          orderBy: { movementNumber: 'desc' },
        });
        const n = last ? parseInt(last.movementNumber.split('-')[2]) + 1 : 1;
        const movementNumber = `${prefix}-${n.toString().padStart(4, '0')}`;

        const movement = await tx.stockMovement.create({
          data: {
            tenantId,
            movementNumber,
            movementType:      'adjustment',
            movementDate:      new Date(),
            itemId:            line.itemId,
            toWarehouseId:     isPositive ? session.warehouseId : null,
            fromWarehouseId:   isPositive ? null : session.warehouseId,
            quantity:          new Decimal(Math.abs(varianceStorageQty)),
            uom:               line.storageUom,
            purchaseQty:       Math.abs(variancePurchaseQty),
            purchaseUom:       line.purchaseUom,
            consumptionQty:    Math.abs(variancePurchaseQty), // approx
            consumptionUom:    line.purchaseUom,
            unitCost:          new Decimal(unitCost),
            unitCostAtMovement:new Decimal(unitCost),
            movementValue:     new Decimal(movementValue),
            referenceType:     'CYCLE_COUNT',
            referenceId:       session.id,
            notes:             `Cycle Count adjustment — ${session.sessionNumber}`,
            createdBy:         userId,
          },
        });

        // Update stock
        const existing = await tx.stock.findFirst({
          where: { tenantId, itemId: line.itemId, warehouseId: session.warehouseId },
        });
        if (existing) {
          const newPurchaseQty = Math.max(0, Number(existing.purchaseQty ?? 0) + variancePurchaseQty);
          const newStorageQty  = Math.max(0, Number(existing.storageQty  ?? 0) + varianceStorageQty);
          await tx.stock.update({
            where: { id: existing.id },
            data:  {
              purchaseQty:    new Decimal(newPurchaseQty),
              onHandQuantity: new Decimal(newStorageQty),
              storageQty:     new Decimal(newStorageQty),
            },
          });
        }

        // Mark line as adjusted with movement ref
        await tx.stockCountLine.update({
          where: { id: line.id },
          data:  {
            status:              'adjusted',
            adjustmentMovementId: movement.id,
            updatedBy:           userId,
          },
        });
      }

      // Mark session as posted
      await tx.stockCountSession.update({
        where: { id },
        data:  { status: 'posted', postedAt: new Date(), updatedBy: userId },
      });
    });

    return this.findOne(tenantId, id);
  }

  // ── Cancel session ──────────────────────────────────────────────────────────

  async cancel(tenantId: string, userId: string, id: string) {
    const session = await this.prisma.stockCountSession.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!session) throw new NotFoundException('Count session not found');
    if (['posted', 'cancelled'].includes(session.status)) {
      throw new BadRequestException(`Cannot cancel a "${session.status}" session`);
    }

    await this.prisma.stockCountSession.update({
      where: { id },
      data:  { status: 'cancelled', updatedBy: userId },
    });

    return this.findOne(tenantId, id);
  }
}