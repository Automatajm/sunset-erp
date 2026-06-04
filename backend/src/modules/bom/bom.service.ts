import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ItemsService } from '../items/items.service';
import { ConsumptionGroupsService } from '../consumption-groups/consumption-groups.service';
import { WorkCentersService } from '../work-centers/work-centers.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { CreateBomRoutingDto, UpdateBomRoutingDto } from './dto/bom-routing.dto';
import { Decimal } from '@prisma/client/runtime/library';

// ── Shared includes ───────────────────────────────────────────────────────────

const COMPONENT_INCLUDE = {
  consumptionGroup: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      consumptionUomId: true,
      consumptionUom: {
        select: { id: true, code: true, name: true, type: true, system: true },
      },
    },
  },
  consumptionUom: {
    select: { id: true, code: true, name: true, type: true, system: true },
  },
};

const ROUTING_INCLUDE = {
  workCenter: {
    select: { id: true, code: true, name: true, costPerHour: true },
  },
};

const BOM_FULL_INCLUDE = {
  parentItem: { select: { id: true, code: true, name: true, baseUom: true } },
  components: {
    // Soft-deleted components must never reach MRP calculations (spec-011).
    where: { deletedAt: null },
    include: COMPONENT_INCLUDE,
    orderBy: { lineNumber: 'asc' as const },
  },
  routings: {
    where: { deletedAt: null },
    include: ROUTING_INCLUDE,
    orderBy: { stepNumber: 'asc' as const },
  },
};

const BOM_LIST_INCLUDE = {
  parentItem: { select: { id: true, code: true, name: true } },
  _count: { select: { components: true, routings: true } },
};

@Injectable()
export class BomService {
  constructor(
    private prisma: PrismaService,
    private itemsService: ItemsService,
    private consumptionGroupsService: ConsumptionGroupsService,
    private workCentersService: WorkCentersService,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, createBomDto: CreateBomDto) {
    // Foreign validations go through the owning modules' scoped services (spec-011) —
    // each findOne throws its own 404.
    await this.itemsService.findOne(tenantId, createBomDto.itemId);

    // Validate all consumption groups; keep them for the consumptionUomId auto-fill
    // so no second lookup is needed.
    const groups = new Map<string, { consumptionUomId: string | null }>();
    for (const comp of createBomDto.components) {
      if (!groups.has(comp.consumptionGroupId)) {
        const cg = await this.consumptionGroupsService.findOne(tenantId, comp.consumptionGroupId);
        groups.set(comp.consumptionGroupId, cg as any);
      }
    }

    const bomNumber = createBomDto.bomCode || (await this.generateBomNumber(tenantId));
    const existing = await this.prisma.bom.findFirst({
      where: { tenantId, bomNumber, deletedAt: null },
    });
    if (existing) throw new ConflictException(`BOM with number ${bomNumber} already exists`);

    const versionNumber = createBomDto.version ? parseInt(createBomDto.version) : 1;

    const bom = await this.prisma.bom.create({
      data: {
        tenantId,
        parentItemId: createBomDto.itemId,
        bomNumber,
        version: versionNumber,
        isActive: createBomDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
        components: {
          create: createBomDto.components.map((comp, index) => ({
            tenantId,
            consumptionGroupId: comp.consumptionGroupId,
            lineNumber: index + 1,
            quantityPer: new Decimal(comp.quantity),
            uom: comp.uom,
            // Auto-fill from the already-validated group when not provided.
            consumptionUomId:
              comp.consumptionUomId ??
              groups.get(comp.consumptionGroupId)?.consumptionUomId ??
              null,
            scrapPercent: new Decimal(comp.scrapPercent || 0),
            createdBy: userId,
            updatedBy: userId,
          })),
        },
      },
      include: BOM_FULL_INCLUDE,
    });

    return this.formatBomResponse(bom);
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, itemId?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (itemId) where.parentItemId = itemId;

    const boms = await this.prisma.bom.findMany({
      where,
      include: BOM_LIST_INCLUDE,
      orderBy: { bomNumber: 'asc' },
    });
    return { boms, count: boms.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const bom = await this.prisma.bom.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: BOM_FULL_INCLUDE,
    });
    if (!bom) throw new NotFoundException(`BOM with ID ${id} not found`);
    return this.formatBomResponse(bom);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, updateBomDto: UpdateBomDto) {
    await this.findOne(tenantId, id);

    if (updateBomDto.bomCode) {
      const existing = await this.prisma.bom.findFirst({
        where: { tenantId, bomNumber: updateBomDto.bomCode, id: { not: id }, deletedAt: null },
      });
      if (existing)
        throw new ConflictException(`BOM with number ${updateBomDto.bomCode} already exists`);
    }

    // Re-parenting must resolve in-tenant (cross-tenant FK vector, spec-011).
    if (updateBomDto.itemId) await this.itemsService.findOne(tenantId, updateBomDto.itemId);

    const updateData: any = { updatedBy: userId };
    if (updateBomDto.bomCode) updateData.bomNumber = updateBomDto.bomCode;
    if (updateBomDto.version) updateData.version = parseInt(updateBomDto.version);
    if (updateBomDto.isActive !== undefined) updateData.isActive = updateBomDto.isActive;
    if (updateBomDto.itemId) updateData.parentItemId = updateBomDto.itemId;

    // Tenant scope enforced at the write itself, then re-fetch (spec-011).
    await this.prisma.bom.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: updateData,
    });
    const bom = await this.prisma.bom.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: BOM_FULL_INCLUDE,
    });

    return this.formatBomResponse(bom);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    // Own-relation count: a BOM referenced by production plan lines cannot be
    // deleted (spec-011). ProductionPlanLine has no deletedAt — unfiltered count.
    const bom = await this.prisma.bom.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { productionPlanLines: true } } },
    });
    if (!bom) throw new NotFoundException(`BOM with ID ${id} not found`);
    if (bom._count.productionPlanLines > 0)
      throw new BadRequestException(
        `Cannot delete: ${bom._count.productionPlanLines} production plan lines still reference this BOM`,
      );
    await this.prisma.bom.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'BOM deleted successfully', id };
  }

  // ── Material Requirements ──────────────────────────────────────────────────

  async calculateMaterialRequirements(tenantId: string, id: string, quantity: number) {
    const bom = await this.findOne(tenantId, id);

    const requirements = bom.components.map((comp: any) => {
      const requiredQty = comp.quantityPer * quantity;
      const scrapQty = (requiredQty * comp.scrapPercent) / 100;
      const totalQty = requiredQty + scrapQty;
      return {
        consumptionGroup: comp.consumptionGroup,
        quantityPerUnit: comp.quantityPer,
        requiredQuantity: requiredQty,
        scrapQuantity: scrapQty,
        totalQuantity: totalQty,
        uom: comp.uom, // formulador UOM
        consumptionUom: comp.consumptionUom, // system UOM — MRP target
      };
    });

    return {
      bom: {
        id: bom.id,
        bomNumber: bom.bomNumber,
        parentItem: bom.parentItem,
        version: bom.version,
      },
      productionQuantity: quantity,
      requirements,
      totalComponents: requirements.length,
    };
  }

  // ── Material Suggestions (for MO actuals pre-fill) ────────────────────────

  async getMaterialSuggestions(tenantId: string, bomId: string, quantity: number) {
    const bom = await this.findOne(tenantId, bomId);

    return bom.components.map((comp: any) => {
      const qtyRequired = comp.quantityPer * quantity;
      const scrapQty = (qtyRequired * comp.scrapPercent) / 100;
      const qtyPlanned = qtyRequired + scrapQty;

      return {
        consumptionGroupId: comp.consumptionGroup.id,
        consumptionGroupCode: comp.consumptionGroup.code,
        consumptionGroupName: comp.consumptionGroup.name,
        qtyPlanned: Math.ceil(qtyPlanned * 1000) / 1000,
        uom: comp.uom,
        consumptionUom: comp.consumptionUom ?? null,
        scrapPercent: comp.scrapPercent,
        note: comp.scrapPercent > 0 ? `Includes ${comp.scrapPercent}% scrap` : undefined,
      };
    });
  }

  // ── Routing: Add ──────────────────────────────────────────────────────────

  async addRoutingStep(tenantId: string, userId: string, bomId: string, dto: CreateBomRoutingDto) {
    await this.findOne(tenantId, bomId);

    // Work center validation via the owning module's scoped service (404).
    await this.workCentersService.findOne(tenantId, dto.workCenterId);

    const existing = await this.prisma.bomRouting.findFirst({
      where: { tenantId, bomId, stepNumber: dto.stepNumber, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Step ${dto.stepNumber} already exists for this BOM`);

    const step = await this.prisma.bomRouting.create({
      data: {
        tenantId,
        bomId,
        stepNumber: dto.stepNumber,
        workCenterId: dto.workCenterId,
        description: dto.description ?? null,
        setupTime: new Decimal(dto.setupTime ?? 0),
        runTimePerUnit: new Decimal(dto.runTimePerUnit ?? 0),
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
      include: ROUTING_INCLUDE,
    });

    return this.formatRoutingStep(step);
  }

  // ── Routing: Get All ──────────────────────────────────────────────────────

  async getRoutingSteps(tenantId: string, bomId: string) {
    await this.findOne(tenantId, bomId);
    const steps = await this.prisma.bomRouting.findMany({
      where: { bomId, tenantId, deletedAt: null },
      include: ROUTING_INCLUDE,
      orderBy: { stepNumber: 'asc' },
    });
    return steps.map((s) => this.formatRoutingStep(s));
  }

  // ── Routing: Update ───────────────────────────────────────────────────────

  async updateRoutingStep(
    tenantId: string,
    userId: string,
    bomId: string,
    stepId: string,
    dto: UpdateBomRoutingDto,
  ) {
    await this.findOne(tenantId, bomId);

    const step = await this.prisma.bomRouting.findFirst({
      where: { id: stepId, bomId, tenantId, deletedAt: null },
    });
    if (!step) throw new NotFoundException(`Routing step ${stepId} not found`);

    if (dto.workCenterId) {
      await this.workCentersService.findOne(tenantId, dto.workCenterId);
    }

    if (dto.stepNumber && dto.stepNumber !== step.stepNumber) {
      const conflict = await this.prisma.bomRouting.findFirst({
        where: {
          tenantId,
          bomId,
          stepNumber: dto.stepNumber,
          id: { not: stepId },
          deletedAt: null,
        },
      });
      if (conflict) throw new ConflictException(`Step ${dto.stepNumber} already exists`);
    }

    const data: any = { updatedBy: userId };
    if (dto.stepNumber !== undefined) data.stepNumber = dto.stepNumber;
    if (dto.workCenterId) data.workCenterId = dto.workCenterId;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.setupTime !== undefined) data.setupTime = new Decimal(dto.setupTime);
    if (dto.runTimePerUnit !== undefined) data.runTimePerUnit = new Decimal(dto.runTimePerUnit);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.notes !== undefined) data.notes = dto.notes;

    // Tenant scope enforced at the write itself, then re-fetch (spec-011).
    await this.prisma.bomRouting.updateMany({
      where: { id: stepId, tenantId, deletedAt: null },
      data,
    });
    const updated = await this.prisma.bomRouting.findFirst({
      where: { id: stepId, tenantId, deletedAt: null },
      include: ROUTING_INCLUDE,
    });

    return this.formatRoutingStep(updated);
  }

  // ── Routing: Remove ───────────────────────────────────────────────────────

  async removeRoutingStep(tenantId: string, userId: string, bomId: string, stepId: string) {
    await this.findOne(tenantId, bomId);

    const step = await this.prisma.bomRouting.findFirst({
      where: { id: stepId, bomId, tenantId, deletedAt: null },
    });
    if (!step) throw new NotFoundException(`Routing step ${stepId} not found`);

    await this.prisma.bomRouting.updateMany({
      where: { id: stepId, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Routing step deleted', id: stepId };
  }

  // ── Routing: Labor Estimate ───────────────────────────────────────────────

  async getLaborEstimate(tenantId: string, bomId: string, quantity: number) {
    const bom = await this.findOne(tenantId, bomId);

    const steps = await this.prisma.bomRouting.findMany({
      where: { bomId, tenantId, deletedAt: null, isActive: true },
      include: ROUTING_INCLUDE,
      orderBy: { stepNumber: 'asc' },
    });

    if (steps.length === 0) {
      return {
        bom: { id: bom.id, bomNumber: bom.bomNumber },
        quantity,
        steps: [],
        totalSetupHours: 0,
        totalRunHours: 0,
        totalLaborHours: 0,
        estimatedLaborCost: 0,
        message: 'No routing steps defined for this BOM',
      };
    }

    let totalSetupHours = 0;
    let totalRunHours = 0;
    let totalCost = 0;

    const stepDetails = steps.map((s) => {
      const setup = Number(s.setupTime);
      const runTotal = Number(s.runTimePerUnit) * quantity;
      const total = setup + runTotal;
      const rate = s.workCenter.costPerHour ? Number(s.workCenter.costPerHour) : 0;
      const cost = total * rate;

      totalSetupHours += setup;
      totalRunHours += runTotal;
      totalCost += cost;

      return {
        stepNumber: s.stepNumber,
        description: s.description,
        workCenter: s.workCenter,
        setupTime: setup,
        runTimePerUnit: Number(s.runTimePerUnit),
        totalRunHours: runTotal,
        totalHours: total,
        costPerHour: rate,
        estimatedCost: cost,
      };
    });

    return {
      bom: { id: bom.id, bomNumber: bom.bomNumber, parentItem: bom.parentItem },
      quantity,
      steps: stepDetails,
      totalSetupHours,
      totalRunHours,
      totalLaborHours: totalSetupHours + totalRunHours,
      estimatedLaborCost: totalCost,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async generateBomNumber(tenantId: string): Promise<string> {
    const prefix = `BOM-${new Date().getFullYear()}`;
    // Numeric max, not lexicographic ('...-99' ranks above '...-104' as a string),
    // with a NaN guard; spans soft-deleted rows (the unique constraint does too).
    const rows = await this.prisma.bom.findMany({
      where: { tenantId, bomNumber: { startsWith: prefix } },
      select: { bomNumber: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.bomNumber.split('-')[2] ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
  }

  private formatBomResponse(bom: any) {
    return {
      ...bom,
      components: bom.components?.map((comp: any) => ({
        ...comp,
        quantityPer: Number(comp.quantityPer),
        scrapPercent: Number(comp.scrapPercent),
      })),
      routings: bom.routings?.map((r: any) => this.formatRoutingStep(r)),
    };
  }

  private formatRoutingStep(step: any) {
    return {
      ...step,
      setupTime: Number(step.setupTime),
      runTimePerUnit: Number(step.runTimePerUnit),
    };
  }
}
