import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import {
  UpdateProductionPlanDto,
  UpdateProductionPlanLineDto,
} from './dto/update-production-plan.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ProductionPlansService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-number PP-YYYY-NNNN ───────────────────────────────────────────────

  private async generatePlanNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PP-${year}`;
    const last = await this.prisma.productionPlan.findFirst({
      where: { tenantId, planNumber: { startsWith: prefix } },
      orderBy: { planNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.planNumber.split('-')[2], 10);
    return `${prefix}-${(isNaN(n) ? 1 : n + 1).toString().padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateProductionPlanDto) {
    // Date sanity — inverted ranges are always a data-entry error.
    if (new Date(dto.periodEnd) < new Date(dto.periodStart)) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }
    for (const line of dto.lines) {
      if (new Date(line.plannedEnd) < new Date(line.plannedStart)) {
        throw new BadRequestException('Each line plannedEnd must be on or after its plannedStart');
      }
    }

    // Validate items and resolve BOMs
    const resolvedLines: Array<{
      itemId: string;
      bomId?: string;
      plannedQty: number;
      uom: string;
      plannedStart: Date;
      plannedEnd: Date;
      soLineId?: string;
      notes?: string;
    }> = [];

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];

      const item = await this.prisma.item.findFirst({
        where: { id: line.itemId, tenantId, deletedAt: null },
      });
      if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);

      let bomId = line.bomId;
      if (!bomId) {
        // Auto-resolve active BOM for this item
        const activeBom = await this.prisma.bom.findFirst({
          where: { tenantId, parentItemId: line.itemId, isActive: true, deletedAt: null },
          orderBy: { version: 'desc' },
        });
        bomId = activeBom?.id;
      } else {
        const bom = await this.prisma.bom.findFirst({
          where: { id: bomId, tenantId, deletedAt: null },
        });
        if (!bom) throw new NotFoundException(`BOM ${bomId} not found`);
      }

      if (line.soLineId) {
        const soLine = await this.prisma.salesOrderLine.findFirst({
          where: { id: line.soLineId, tenantId, deletedAt: null },
        });
        if (!soLine) throw new NotFoundException(`SO line ${line.soLineId} not found`);
      }

      resolvedLines.push({
        itemId: line.itemId,
        bomId,
        plannedQty: line.plannedQty,
        uom: line.uom,
        plannedStart: new Date(line.plannedStart),
        plannedEnd: new Date(line.plannedEnd),
        soLineId: line.soLineId,
        notes: line.notes,
      });
    }

    const planNumber = await this.generatePlanNumber(tenantId);

    try {
      return await this.prisma.productionPlan.create({
        data: {
          tenantId,
          planNumber,
          title: dto.title,
          horizon: dto.horizon,
          source: dto.source ?? 'free',
          periodStart: new Date(dto.periodStart),
          periodEnd: new Date(dto.periodEnd),
          status: 'draft',
          notes: dto.notes,
          createdBy: userId,
          updatedBy: userId,
          lines: {
            create: resolvedLines.map((l, idx) => ({
              tenantId,
              lineNumber: idx + 1,
              itemId: l.itemId,
              bomId: l.bomId,
              plannedQty: new Decimal(l.plannedQty),
              uom: l.uom,
              plannedStart: l.plannedStart,
              plannedEnd: l.plannedEnd,
              soLineId: l.soLineId,
              notes: l.notes,
              status: 'pending',
              createdBy: userId,
              updatedBy: userId,
            })),
          },
        },
        include: this.planInclude(),
      });
    } catch (e) {
      // @@unique([tenantId, planNumber]) can race on concurrent creates.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `Plan number ${planNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, horizon?: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (horizon) where.horizon = horizon;
    if (status) where.status = status;

    const productionPlans = await this.prisma.productionPlan.findMany({
      where,
      include: {
        _count: { select: { lines: true } },
        lines: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            plannedQty: true,
            producedQty: true,
            item: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { periodStart: 'desc' },
    });

    return { productionPlans, count: productionPlans.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const plan = await this.prisma.productionPlan.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.planInclude(),
    });
    if (!plan) throw new NotFoundException(`Production Plan ${id} not found`);
    return this.formatPlan(plan);
  }

  // ── Update header ──────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateProductionPlanDto) {
    const plan = await this.findOne(tenantId, id);
    if (!['draft', 'confirmed'].includes(plan.status)) {
      throw new BadRequestException('Can only update draft or confirmed plans');
    }

    if (dto.periodStart && dto.periodEnd && new Date(dto.periodEnd) < new Date(dto.periodStart)) {
      throw new BadRequestException('periodEnd must be on or after periodStart');
    }

    // Tenant-scoped at the write itself, then re-fetch for the joined response.
    await this.prisma.productionPlan.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...dto,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : undefined,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : undefined,
        updatedBy: userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Update line ────────────────────────────────────────────────────────────

  async updateLine(
    tenantId: string,
    userId: string,
    planId: string,
    lineId: string,
    dto: UpdateProductionPlanLineDto,
  ) {
    await this.findOne(tenantId, planId);

    const line = await this.prisma.productionPlanLine.findFirst({
      where: { id: lineId, planId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException(`Plan line ${lineId} not found`);

    const data: any = { updatedBy: userId };
    if (dto.plannedQty !== undefined) data.plannedQty = new Decimal(dto.plannedQty);
    if (dto.producedQty !== undefined) data.producedQty = new Decimal(dto.producedQty);
    if (dto.plannedStart) data.plannedStart = new Date(dto.plannedStart);
    if (dto.plannedEnd) data.plannedEnd = new Date(dto.plannedEnd);
    if (dto.notes !== undefined) data.notes = dto.notes;

    await this.prisma.productionPlanLine.updateMany({
      where: { id: lineId, tenantId, deletedAt: null },
      data,
    });

    return this.prisma.productionPlanLine.findFirst({
      where: { id: lineId, tenantId, deletedAt: null },
    });
  }

  // ── Status transitions ─────────────────────────────────────────────────────

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const plan = await this.findOne(tenantId, id);

    const allowed: Record<string, string[]> = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
    };

    if (!allowed[plan.status]?.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${plan.status}' to '${status}'. Allowed: ${allowed[plan.status]?.join(', ') ?? 'none'}`,
      );
    }

    await this.prisma.productionPlan.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { status, updatedBy: userId },
    });

    const updated = await this.prisma.productionPlan.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    return { message: `Plan ${plan.planNumber} → ${status}`, productionPlan: updated };
  }

  // ── Generate MOs from plan (Opción A) ──────────────────────────────────────
  // Creates a ProductionOrder for each pending plan line that doesn't have one yet

  async generateMos(tenantId: string, userId: string, id: string, lineIds?: string[]) {
    const plan = await this.findOne(tenantId, id);

    if (!['confirmed', 'in_progress'].includes(plan.status)) {
      throw new BadRequestException('Plan must be confirmed before generating MOs');
    }

    const lines = plan.lines.filter((l: any) => {
      const isPending = l.status === 'pending';
      const noMo = !l.productionOrders?.length;
      const inScope = !lineIds || lineIds.includes(l.id);
      return isPending && noMo && inScope;
    });

    if (lines.length === 0) {
      return {
        message: 'No eligible lines found (must be pending with no linked MO)',
        created: 0,
        mos: [],
      };
    }

    const created: any[] = [];

    // Atomic: MOs + line flips + plan promotion commit together or not at all.
    // MO numbers are generated through the tx so sequential generations in this
    // loop see their own uncommitted MOs. Numbering logic = numeric max, identical
    // to ProductionOrdersService.generatePoNumber (spec-024 owns the shared
    // MO-<year> sequence; @@unique([tenantId, poNumber]) backstops races).
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const line of lines) {
          const year = new Date().getFullYear();
          const prefix = `MO-${year}`;
          const moRows = await tx.productionOrder.findMany({
            where: { tenantId, poNumber: { startsWith: prefix } },
            select: { poNumber: true },
          });
          const moMax = moRows.reduce((m: number, r: { poNumber: string }) => {
            const n = parseInt(r.poNumber.split('-').pop() ?? '', 10);
            return isNaN(n) ? m : Math.max(m, n);
          }, 0);
          const moNum = `${prefix}-${(moMax + 1).toString().padStart(4, '0')}`;

          const mo = await tx.productionOrder.create({
            data: {
              tenantId,
              poNumber: moNum,
              itemId: line.itemId,
              bomId: line.bomId ?? undefined,
              quantityToProduce: new Decimal(Number(line.plannedQty)),
              quantityProduced: new Decimal(0),
              plannedStartDate: line.plannedStart,
              plannedEndDate: line.plannedEnd,
              status: 'draft',
              planLineId: line.id,
              createdBy: userId,
              updatedBy: userId,
            },
          });

          await tx.productionPlanLine.updateMany({
            where: { id: line.id, tenantId, deletedAt: null },
            data: { status: 'mo_created', updatedBy: userId },
          });

          created.push(mo);
        }

        // If plan is still confirmed, move to in_progress
        if (plan.status === 'confirmed') {
          await tx.productionPlan.updateMany({
            where: { id, tenantId, deletedAt: null },
            data: { status: 'in_progress', updatedBy: userId },
          });
        }
      });
    } catch (e) {
      // @@unique on poNumber can race with concurrent generations.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          'A production-order number was just taken by a concurrent request. Please retry.',
        );
      }
      throw e;
    }

    return {
      message: `${created.length} MO${created.length !== 1 ? 's' : ''} created from plan ${plan.planNumber}`,
      created: created.length,
      mos: created,
    };
  }

  // ── Link existing MO to plan line (Opción B) ───────────────────────────────

  async linkMo(tenantId: string, userId: string, planId: string, lineId: string, moId: string) {
    await this.findOne(tenantId, planId);

    const line = await this.prisma.productionPlanLine.findFirst({
      where: { id: lineId, planId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException(`Plan line ${lineId} not found`);

    const mo = await this.prisma.productionOrder.findFirst({
      where: { id: moId, tenantId, deletedAt: null },
    });
    if (!mo) throw new NotFoundException(`Production Order ${moId} not found`);

    // An MO belongs to at most one plan line — never silently steal it.
    if (mo.planLineId && mo.planLineId !== lineId) {
      throw new ConflictException(`MO ${mo.poNumber} is already linked to another plan line`);
    }
    if (line.status === 'mo_created') {
      throw new BadRequestException(`Plan line ${line.lineNumber} already has a linked MO`);
    }

    await this.prisma.productionOrder.updateMany({
      where: { id: moId, tenantId, deletedAt: null },
      data: { planLineId: lineId, updatedBy: userId },
    });

    await this.prisma.productionPlanLine.updateMany({
      where: { id: lineId, tenantId, deletedAt: null },
      data: { status: 'mo_created', updatedBy: userId },
    });

    return { message: `MO ${mo.poNumber} linked to plan line ${line.lineNumber}` };
  }

  // ── Actual vs Planned summary ──────────────────────────────────────────────

  async getActualVsPlanned(tenantId: string, id: string) {
    const plan = await this.findOne(tenantId, id);

    const summary = plan.lines.map((line: any) => {
      const plannedQty = Number(line.plannedQty);
      const producedQty = Number(line.producedQty);
      const pct = plannedQty > 0 ? (producedQty / plannedQty) * 100 : 0;
      const variance = producedQty - plannedQty;

      // Aggregate from linked MOs
      const linkedMos = line.productionOrders ?? [];
      const moSummary = {
        total: linkedMos.length,
        draft: linkedMos.filter((m: any) => m.status === 'draft').length,
        inProgress: linkedMos.filter((m: any) => m.status === 'in_progress').length,
        completed: linkedMos.filter((m: any) => m.status === 'completed').length,
        cancelled: linkedMos.filter((m: any) => m.status === 'cancelled').length,
      };

      return {
        lineId: line.id,
        lineNumber: line.lineNumber,
        item: line.item,
        uom: line.uom,
        plannedStart: line.plannedStart,
        plannedEnd: line.plannedEnd,
        plannedQty,
        producedQty,
        variance,
        completionPct: Math.round(pct * 10) / 10,
        status: line.status,
        moSummary,
      };
    });

    const totals = {
      totalPlanned: summary.reduce((s: number, l: any) => s + l.plannedQty, 0),
      totalProduced: summary.reduce((s: number, l: any) => s + l.producedQty, 0),
      linesCompleted: summary.filter((l: any) => l.status === 'completed').length,
      linesPending: summary.filter((l: any) => l.status === 'pending').length,
      linesMoCreated: summary.filter((l: any) => l.status === 'mo_created').length,
    };

    return {
      plan: {
        id: plan.id,
        planNumber: plan.planNumber,
        title: plan.title,
        horizon: plan.horizon,
        status: plan.status,
        periodStart: plan.periodStart,
        periodEnd: plan.periodEnd,
        crpStatus: plan.crpStatus,
      },
      summary,
      totals,
    };
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const plan = await this.findOne(tenantId, id);
    if (plan.status !== 'draft') {
      throw new BadRequestException('Can only delete draft plans');
    }

    await this.prisma.productionPlan.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Production Plan deleted', id };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private planInclude() {
    return {
      lines: {
        where: { deletedAt: null },
        include: {
          item: { select: { id: true, code: true, name: true, baseUom: true } },
          bom: { select: { id: true, bomNumber: true, version: true } },
          soLine: { select: { id: true, salesOrderId: true, orderedQuantity: true } },
          productionOrders: {
            where: { deletedAt: null },
            select: {
              id: true,
              poNumber: true,
              status: true,
              quantityToProduce: true,
              quantityProduced: true,
              plannedStartDate: true,
              plannedEndDate: true,
            },
          },
        },
        orderBy: { lineNumber: 'asc' as const },
      },
      _count: { select: { lines: true } },
    };
  }

  private formatPlan(plan: any) {
    return {
      ...plan,
      lines: plan.lines?.map((l: any) => ({
        ...l,
        plannedQty: Number(l.plannedQty),
        producedQty: Number(l.producedQty),
        productionOrders: l.productionOrders?.map((mo: any) => ({
          ...mo,
          quantityToProduce: Number(mo.quantityToProduce),
          quantityProduced: Number(mo.quantityProduced),
        })),
      })),
    };
  }
}
