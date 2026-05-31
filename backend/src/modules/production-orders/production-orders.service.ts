import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import {
  CreateLaborActualDto,
  CreateMaterialActualDto,
  DeliverFgDto,
  PostVarianceJeDto,
} from './dto/production-actuals.dto';
import { AutomationService } from '../automation/automation.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductionOrdersService {
  constructor(
    private prisma: PrismaService,
    private automation: AutomationService,
  ) {}

  // ─────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateProductionOrderDto) {
    const bom = await this.prisma.bom.findFirst({
      where: { id: dto.bomId, tenantId, deletedAt: null },
      include: {
        parentItem: true,
        components: { include: { consumptionGroup: true, consumptionUom: true } },
      },
    });
    if (!bom) throw new NotFoundException('BOM not found');

    if (dto.workCenterId) {
      const wc = await this.prisma.workCenter.findFirst({
        where: { id: dto.workCenterId, tenantId, deletedAt: null },
      });
      if (!wc) throw new NotFoundException('Work center not found');
    }

    const poNumber = await this.generatePoNumber(tenantId);

    const productionOrder = await this.prisma.productionOrder.create({
      data: {
        tenantId,
        poNumber,
        bomId: dto.bomId,
        itemId: bom.parentItemId,
        quantityToProduce: new Decimal(dto.quantityOrdered),
        quantityProduced: new Decimal(0),
        plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
        plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
        status: 'draft',
        notes: dto.notes,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return this.formatMo(productionOrder, bom);
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;
    const orders = await this.prisma.productionOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => this.formatMo(o));
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!order) throw new NotFoundException(`Production order ${id} not found`);

    let bom = null;
    if (order.bomId) {
      bom = await this.prisma.bom.findFirst({
        where: { id: order.bomId },
        include: {
          parentItem: true,
          components: { include: { consumptionGroup: true, consumptionUom: true } },
        },
      });
    }
    return this.formatMo(order, bom);
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateProductionOrderDto) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'draft') {
      throw new BadRequestException('Can only update production orders in draft status');
    }
    const data: any = { updatedBy: userId };
    if (dto.quantityOrdered !== undefined)
      data.quantityToProduce = new Decimal(dto.quantityOrdered);
    if (dto.plannedStartDate) data.plannedStartDate = new Date(dto.plannedStartDate);
    if (dto.plannedEndDate) data.plannedEndDate = new Date(dto.plannedEndDate);
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.productionOrder.update({ where: { id }, data });
    return this.formatMo(updated);
  }

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const order = await this.findOne(tenantId, id);
    const updated = await this.prisma.productionOrder.update({
      where: { id },
      data: {
        status,
        actualStartDate:
          status === 'in_progress' && !order.actualStartDate ? new Date() : order.actualStartDate,
        actualEndDate: status === 'completed' ? new Date() : order.actualEndDate,
        updatedBy: userId,
      },
    });
    return {
      message: `Production order ${order.poNumber} status updated to ${status}`,
      productionOrder: this.formatMo(updated),
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'draft') {
      throw new BadRequestException('Can only delete production orders in draft status');
    }
    await this.prisma.productionOrder.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Production order deleted', id };
  }

  // ─────────────────────────────────────────────
  // LABOR ACTUALS
  // ─────────────────────────────────────────────

  async addLaborActual(tenantId: string, userId: string, moId: string, dto: CreateLaborActualDto) {
    const mo = await this.findOne(tenantId, moId);
    if (['draft', 'cancelled'].includes(mo.status)) {
      throw new BadRequestException(`Cannot post labor to MO in status "${mo.status}"`);
    }
    const laborCost = dto.laborRate && dto.hoursActual ? dto.laborRate * dto.hoursActual : null;
    const actual = await this.prisma.moLaborActual.create({
      data: {
        tenantId,
        moId,
        workDate: dto.workDate ? new Date(dto.workDate) : null,
        employeeId: dto.employeeId ?? null,
        employeeName: dto.employeeName ?? null,
        hoursPlanned: dto.hoursPlanned ? new Decimal(dto.hoursPlanned) : null,
        hoursActual: new Decimal(dto.hoursActual),
        laborRate: dto.laborRate ? new Decimal(dto.laborRate) : null,
        laborCost: laborCost ? new Decimal(laborCost) : null,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return { message: 'Labor actual recorded', laborActual: this.formatLaborActual(actual) };
  }

  async getLaborActuals(tenantId: string, moId: string) {
    await this.findOne(tenantId, moId);
    const actuals = await this.prisma.moLaborActual.findMany({
      where: { moId, tenantId, deletedAt: null },
      orderBy: { workDate: 'asc' },
    });
    const totalPlanned = actuals.reduce((s, a) => s + Number(a.hoursPlanned ?? 0), 0);
    const totalActual = actuals.reduce((s, a) => s + Number(a.hoursActual), 0);
    const totalCost = actuals.reduce((s, a) => s + Number(a.laborCost ?? 0), 0);
    return {
      actuals: actuals.map((a) => this.formatLaborActual(a)),
      summary: {
        totalPlannedHours: totalPlanned,
        totalActualHours: totalActual,
        varianceHours: totalActual - totalPlanned,
        totalLaborCost: totalCost,
        efficiency: totalPlanned > 0 ? (totalPlanned / totalActual) * 100 : null,
      },
    };
  }

  // ─────────────────────────────────────────────
  // MATERIAL ACTUALS
  // ─────────────────────────────────────────────

  async addMaterialActual(
    tenantId: string,
    userId: string,
    moId: string,
    dto: CreateMaterialActualDto,
  ) {
    const mo = await this.findOne(tenantId, moId);
    if (['draft', 'cancelled'].includes(mo.status)) {
      throw new BadRequestException(`Cannot post materials to MO in status "${mo.status}"`);
    }
    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, tenantId, deletedAt: null },
    });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);

    const unitCost = dto.unitCost ?? 0;
    const qtyVariance = dto.qtyActual - dto.qtyPlanned;
    const varianceCost = qtyVariance * unitCost;

    const actual = await this.prisma.moMaterialActual.create({
      data: {
        tenantId,
        moId,
        itemId: dto.itemId,
        qtyPlanned: new Decimal(dto.qtyPlanned),
        qtyActual: new Decimal(dto.qtyActual),
        unitCost: new Decimal(unitCost),
        varianceCost: new Decimal(varianceCost),
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
      include: { item: { select: { id: true, code: true, name: true } } },
    });
    return {
      message: 'Material actual recorded',
      materialActual: this.formatMaterialActual(actual),
    };
  }

  async getMaterialActuals(tenantId: string, moId: string) {
    await this.findOne(tenantId, moId);
    const actuals = await this.prisma.moMaterialActual.findMany({
      where: { moId, tenantId, deletedAt: null },
      include: { item: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const totalVarianceCost = actuals.reduce((s, a) => s + Number(a.varianceCost), 0);
    return {
      actuals: actuals.map((a) => this.formatMaterialActual(a)),
      summary: {
        totalMaterials: actuals.length,
        totalVarianceCost,
        overConsumed: actuals.filter((a) => Number(a.qtyActual) > Number(a.qtyPlanned)).length,
        underConsumed: actuals.filter((a) => Number(a.qtyActual) < Number(a.qtyPlanned)).length,
      },
    };
  }

  // ─────────────────────────────────────────────
  // FG DELIVERY + AUTO-JE + VARIANCES
  // ─────────────────────────────────────────────

  async deliverFinishedGoods(tenantId: string, userId: string, moId: string, dto: DeliverFgDto) {
    const mo = await this.findOne(tenantId, moId);
    if (!['released', 'in_progress', 'completed'].includes(mo.status)) {
      throw new BadRequestException(`Cannot deliver FG for MO in status "${mo.status}"`);
    }

    const qtyToProduce = Number(mo.quantityToProduce);
    const qtyDelivered = dto.quantityDelivered;
    const unitCost = dto.unitCost ?? 0;
    const totalFgValue = qtyDelivered * unitCost;

    // 1. Update quantityProduced
    await this.prisma.productionOrder.update({
      where: { id: moId },
      data: {
        quantityProduced: new Decimal(qtyDelivered),
        status: 'completed',
        actualEndDate: new Date(),
        updatedBy: userId,
      },
    });

    // 2. Auto-JE via engine (only if unitCost provided)
    let je = null;
    if (unitCost > 0) {
      je = await this.createFgDeliveryJe(tenantId, userId, mo, qtyDelivered, totalFgValue);
    }

    // 3. Calculate variances
    const variances: any[] = [];
    const qtyVariance = qtyDelivered - qtyToProduce;

    if (Math.abs(qtyVariance) > 0.001) {
      const varianceType = qtyVariance < 0 ? 'merma' : 'surplus';
      const varianceCost = Math.abs(qtyVariance) * unitCost;
      const variance = await this.prisma.productionVariance.create({
        data: {
          tenantId,
          moId,
          varianceType,
          description: `${varianceType === 'merma' ? 'Production loss' : 'Surplus production'} — ${mo.poNumber}`,
          quantity: new Decimal(Math.abs(qtyVariance)),
          unitCost: unitCost > 0 ? new Decimal(unitCost) : null,
          totalCost: varianceCost > 0 ? new Decimal(varianceCost) : null,
          status: 'open',
          notes: dto.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      variances.push(variance);
    }

    return {
      message: `FG delivery confirmed for ${mo.poNumber}`,
      quantityDelivered: qtyDelivered,
      quantityPlanned: qtyToProduce,
      variance: qtyDelivered - qtyToProduce,
      totalFgValue,
      journalEntry: je,
      variancesCreated: variances.length,
      variances,
    };
  }

  // ─────────────────────────────────────────────
  // VARIANCES
  // ─────────────────────────────────────────────

  async getVariances(tenantId: string, moId: string) {
    await this.findOne(tenantId, moId);
    const variances = await this.prisma.productionVariance.findMany({
      where: { moId, tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const totalMerma = variances
      .filter((v) => v.varianceType === 'merma')
      .reduce((s, v) => s + Number(v.totalCost ?? 0), 0);
    const totalSurplus = variances
      .filter((v) => v.varianceType === 'surplus')
      .reduce((s, v) => s + Number(v.totalCost ?? 0), 0);
    return {
      variances: variances.map((v) => this.formatVariance(v)),
      summary: {
        total: variances.length,
        open: variances.filter((v) => v.status === 'open').length,
        jePosted: variances.filter((v) => v.status === 'je_posted').length,
        totalMermaCost: totalMerma,
        totalSurplusCost: totalSurplus,
        netVarianceCost: totalMerma - totalSurplus,
      },
    };
  }

  async getAllVariances(tenantId: string, filters: { status?: string; varianceType?: string }) {
    const where: any = { tenantId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.varianceType) where.varianceType = filters.varianceType;
    const variances = await this.prisma.productionVariance.findMany({
      where,
      include: { productionOrder: { select: { id: true, poNumber: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return variances.map((v) => this.formatVariance(v));
  }

  async postVarianceJe(
    tenantId: string,
    userId: string,
    varianceId: string,
    dto: PostVarianceJeDto,
  ) {
    const variance = await this.prisma.productionVariance.findFirst({
      where: { id: varianceId, tenantId, deletedAt: null },
      include: { productionOrder: true },
    });
    if (!variance) throw new NotFoundException(`Variance ${varianceId} not found`);
    if (variance.status !== 'open')
      throw new BadRequestException('Variance JE already posted or closed');
    if (!variance.totalCost || Number(variance.totalCost) === 0) {
      throw new BadRequestException('Cannot post JE for variance with no cost');
    }

    const je = await this.createVarianceJe(tenantId, userId, variance, dto);
    if (!je) throw new BadRequestException('Variance JE skipped — module set to manual');

    await this.prisma.productionVariance.update({
      where: { id: varianceId },
      data: { status: 'je_posted', jeId: je.id, updatedBy: userId },
    });

    return {
      message: `Variance JE posted for ${variance.varianceType} — ${variance.productionOrder.poNumber}`,
      journalEntry: je,
      variance: this.formatVariance({ ...variance, status: 'je_posted', jeId: je.id }),
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE — JE helpers (via Automation Engine)
  // ─────────────────────────────────────────────

  private async createFgDeliveryJe(
    tenantId: string,
    userId: string,
    mo: any,
    qtyDelivered: number,
    totalFgValue: number,
  ) {
    const fgAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '1.1.05', deletedAt: null },
    });
    const wipAccount = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: '1.1.04', deletedAt: null },
    });
    if (!fgAccount || !wipAccount) return null;

    const entryNumber = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date());

    const result = await this.automation.handleAutoJe({
      tenantId,
      userId,
      module: 'fg_delivery',
      eventType: 'fg_delivery',
      sourceType: 'production_order',
      sourceId: mo.id,
      sourceRef: mo.poNumber,
      jeData: {
        entryNumber,
        entryDate: new Date(),
        fiscalPeriod,
        journalType: 'fg_delivery',
        reference: mo.poNumber,
        description: `FG Delivery — ${mo.poNumber} — ${qtyDelivered} units`,
        lines: [
          {
            lineNumber: 1,
            accountId: fgAccount.id,
            description: `FG Inventory — ${mo.poNumber}`,
            debitAmount: totalFgValue,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            accountId: wipAccount.id,
            description: `WIP cleared — ${mo.poNumber}`,
            debitAmount: 0,
            creditAmount: totalFgValue,
          },
        ],
      },
    });

    return result.je;
  }

  private async createVarianceJe(
    tenantId: string,
    userId: string,
    variance: any,
    dto: PostVarianceJeDto,
  ) {
    const isMerma = variance.varianceType === 'merma';

    const defaultDebitAcct = isMerma
      ? await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '6.2.07', deletedAt: null },
        })
      : await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '1.1.05', deletedAt: null },
        });
    const defaultCreditAcct = isMerma
      ? await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '1.1.05', deletedAt: null },
        })
      : await this.prisma.account.findFirst({
          where: { tenantId, accountNumber: '4.1.01', deletedAt: null },
        });

    const debitAcct = dto.debitAccountId
      ? await this.prisma.account.findFirst({ where: { id: dto.debitAccountId, tenantId } })
      : defaultDebitAcct;
    const creditAcct = dto.creditAccountId
      ? await this.prisma.account.findFirst({ where: { id: dto.creditAccountId, tenantId } })
      : defaultCreditAcct;

    if (!debitAcct || !creditAcct) {
      throw new BadRequestException('Required GL accounts not found for variance JE');
    }

    const entryNumber = await this.generateJeNumber(tenantId);
    const fiscalPeriod = this.toFiscalPeriod(new Date());
    const amount = Number(variance.totalCost);

    const result = await this.automation.handleAutoJe({
      tenantId,
      userId,
      module: 'production_variance',
      eventType: 'production_variance',
      sourceType: 'production_variance',
      sourceId: variance.id,
      sourceRef: variance.productionOrder.poNumber,
      jeData: {
        entryNumber,
        entryDate: new Date(),
        fiscalPeriod,
        journalType: 'production_variance',
        reference: variance.productionOrder.poNumber,
        description: `${variance.varianceType.toUpperCase()} variance — ${variance.productionOrder.poNumber}${dto.notes ? ' — ' + dto.notes : ''}`,
        lines: [
          {
            lineNumber: 1,
            accountId: debitAcct.id,
            description: `${variance.varianceType} — ${variance.description ?? ''}`,
            debitAmount: amount,
            creditAmount: 0,
          },
          {
            lineNumber: 2,
            accountId: creditAcct.id,
            description: `${variance.varianceType} offset — ${variance.productionOrder.poNumber}`,
            debitAmount: 0,
            creditAmount: amount,
          },
        ],
      },
    });

    return result.je;
  }

  // ─────────────────────────────────────────────
  // PRIVATE — Formatters
  // ─────────────────────────────────────────────

  private formatMo(order: any, bom?: any) {
    return {
      ...order,
      quantityToProduce: Number(order.quantityToProduce),
      quantityProduced: Number(order.quantityProduced),
      bom: bom
        ? {
            ...bom,
            components: bom.components?.map((c: any) => ({
              ...c,
              quantityPer: Number(c.quantityPer),
              scrapPercent: Number(c.scrapPercent),
            })),
          }
        : undefined,
    };
  }

  private formatLaborActual(a: any) {
    return {
      ...a,
      hoursPlanned: a.hoursPlanned ? Number(a.hoursPlanned) : null,
      hoursActual: Number(a.hoursActual),
      laborRate: a.laborRate ? Number(a.laborRate) : null,
      laborCost: a.laborCost ? Number(a.laborCost) : null,
    };
  }

  private formatMaterialActual(a: any) {
    return {
      ...a,
      qtyPlanned: Number(a.qtyPlanned),
      qtyActual: Number(a.qtyActual),
      unitCost: Number(a.unitCost),
      varianceCost: Number(a.varianceCost),
    };
  }

  private formatVariance(v: any) {
    return {
      ...v,
      quantity: v.quantity ? Number(v.quantity) : null,
      unitCost: v.unitCost ? Number(v.unitCost) : null,
      totalCost: v.totalCost ? Number(v.totalCost) : null,
    };
  }

  // ─────────────────────────────────────────────
  // PRIVATE — Generators
  // ─────────────────────────────────────────────

  private async generatePoNumber(tenantId: string): Promise<string> {
    const prefix = `MO-${new Date().getFullYear()}`;
    const last = await this.prisma.productionOrder.findFirst({
      where: { tenantId, poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    return `${prefix}-${(parseInt(last.poNumber.split('-')[2]) + 1).toString().padStart(4, '0')}`;
  }

  private async generateJeNumber(tenantId: string): Promise<string> {
    const now = new Date();
    const prefix = `JE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    const last = await this.prisma.journalEntry.findFirst({
      where: { tenantId, entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.entryNumber.split('-');
    return `${prefix}-${(parseInt(parts[parts.length - 1]) + 1).toString().padStart(4, '0')}`;
  }

  private toFiscalPeriod(date: Date): string {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}
