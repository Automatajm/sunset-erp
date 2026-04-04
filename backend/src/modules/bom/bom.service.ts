import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { CreateBomRoutingDto, UpdateBomRoutingDto } from './dto/bom-routing.dto';
import { Decimal } from '@prisma/client/runtime/library';

// ── Shared includes ───────────────────────────────────────────────────────────

const COMPONENT_INCLUDE = {
  componentItem: {
    select: {
      id: true, code: true, name: true, baseUom: true,
      consumptionUomId: true,
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
    include:  COMPONENT_INCLUDE,
    orderBy:  { lineNumber: 'asc' as const },
  },
  routings: {
    where:    { deletedAt: null },
    include:  ROUTING_INCLUDE,
    orderBy:  { stepNumber: 'asc' as const },
  },
};

const BOM_LIST_INCLUDE = {
  parentItem: { select: { id: true, code: true, name: true } },
  _count:     { select: { components: true, routings: true } },
};

@Injectable()
export class BomService {
  constructor(private prisma: PrismaService) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, createBomDto: CreateBomDto) {
    const parentItem = await this.prisma.item.findFirst({
      where: { id: createBomDto.itemId, tenantId, deletedAt: null },
    });
    if (!parentItem) throw new NotFoundException('Parent item not found');

    for (const component of createBomDto.components) {
      const componentItem = await this.prisma.item.findFirst({
        where: { id: component.componentItemId, tenantId, deletedAt: null },
      });
      if (!componentItem) throw new NotFoundException(`Component item ${component.componentItemId} not found`);
      if (component.componentItemId === createBomDto.itemId) {
        throw new BadRequestException('Item cannot be a component of itself');
      }
    }

    const bomNumber = createBomDto.bomCode || await this.generateBomNumber(tenantId);
    const existing  = await this.prisma.bom.findFirst({
      where: { tenantId, bomNumber, deletedAt: null },
    });
    if (existing) throw new ConflictException(`BOM with number ${bomNumber} already exists`);

    const versionNumber = createBomDto.version ? parseInt(createBomDto.version) : 1;

    const bom = await this.prisma.bom.create({
      data: {
        tenantId,
        parentItemId: createBomDto.itemId,
        bomNumber,
        version:  versionNumber,
        isActive: createBomDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
        components: {
          create: createBomDto.components.map((comp, index) => ({
            tenantId,
            componentItemId:  comp.componentItemId,
            lineNumber:       index + 1,
            quantityPer:      new Decimal(comp.quantity),
            uom:              comp.uom,
            // consumptionUomId = system UOM for MRP aggregation (restricted on frontend)
            consumptionUomId: comp.consumptionUomId ?? null,
            scrapPercent:     new Decimal(comp.scrapPercent || 0),
            createdBy:        userId,
            updatedBy:        userId,
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

    return this.prisma.bom.findMany({
      where,
      include:  BOM_LIST_INCLUDE,
      orderBy:  { bomNumber: 'asc' },
    });
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const bom = await this.prisma.bom.findFirst({
      where:   { id, tenantId, deletedAt: null },
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
      if (existing) throw new ConflictException(`BOM with number ${updateBomDto.bomCode} already exists`);
    }

    const updateData: any = { updatedBy: userId };
    if (updateBomDto.bomCode)              updateData.bomNumber    = updateBomDto.bomCode;
    if (updateBomDto.description !== undefined) updateData.description = updateBomDto.description;
    if (updateBomDto.version)              updateData.version      = parseInt(updateBomDto.version);
    if (updateBomDto.isActive !== undefined)    updateData.isActive    = updateBomDto.isActive;
    if (updateBomDto.itemId)               updateData.parentItemId = updateBomDto.itemId;

    const bom = await this.prisma.bom.update({
      where:   { id },
      data:    updateData,
      include: BOM_FULL_INCLUDE,
    });

    return this.formatBomResponse(bom);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.bom.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'BOM deleted successfully', id };
  }

  // ── Material Requirements ──────────────────────────────────────────────────

  async calculateMaterialRequirements(tenantId: string, id: string, quantity: number) {
    const bom = await this.findOne(tenantId, id);

    const requirements = bom.components.map((comp: any) => {
      const requiredQty = comp.quantityPer * quantity;
      const scrapQty    = (requiredQty * comp.scrapPercent) / 100;
      const totalQty    = requiredQty + scrapQty;
      return {
        componentItem:    comp.componentItem,
        quantityPerUnit:  comp.quantityPer,
        requiredQuantity: requiredQty,
        scrapQuantity:    scrapQty,
        totalQuantity:    totalQty,
        uom:              comp.uom,
        // MRP target UOM — what the engine will aggregate to
        consumptionUom:   comp.consumptionUom ?? null,
      };
    });

    return {
      bom: { id: bom.id, bomNumber: bom.bomNumber, parentItem: bom.parentItem, version: bom.version },
      productionQuantity: quantity,
      requirements,
      totalComponents: requirements.length,
    };
  }

  // ── Routing: Add ──────────────────────────────────────────────────────────

  async addRoutingStep(tenantId: string, userId: string, bomId: string, dto: CreateBomRoutingDto) {
    await this.findOne(tenantId, bomId);

    const wc = await this.prisma.workCenter.findFirst({
      where: { id: dto.workCenterId, tenantId, deletedAt: null },
    });
    if (!wc) throw new NotFoundException(`Work center ${dto.workCenterId} not found`);

    const existing = await this.prisma.bomRouting.findFirst({
      where: { bomId, stepNumber: dto.stepNumber, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Step ${dto.stepNumber} already exists for this BOM`);

    const step = await this.prisma.bomRouting.create({
      data: {
        tenantId,
        bomId,
        stepNumber:     dto.stepNumber,
        workCenterId:   dto.workCenterId,
        description:    dto.description ?? null,
        setupTime:      new Decimal(dto.setupTime ?? 0),
        runTimePerUnit: new Decimal(dto.runTimePerUnit ?? 0),
        notes:          dto.notes ?? null,
        createdBy:      userId,
        updatedBy:      userId,
      },
      include: ROUTING_INCLUDE,
    });

    return this.formatRoutingStep(step);
  }

  // ── Routing: Get All ──────────────────────────────────────────────────────

  async getRoutingSteps(tenantId: string, bomId: string) {
    await this.findOne(tenantId, bomId);

    const steps = await this.prisma.bomRouting.findMany({
      where:   { bomId, tenantId, deletedAt: null },
      include: ROUTING_INCLUDE,
      orderBy: { stepNumber: 'asc' },
    });

    return steps.map(s => this.formatRoutingStep(s));
  }

  // ── Routing: Update ───────────────────────────────────────────────────────

  async updateRoutingStep(
    tenantId: string, userId: string,
    bomId: string, stepId: string,
    dto: UpdateBomRoutingDto,
  ) {
    await this.findOne(tenantId, bomId);

    const step = await this.prisma.bomRouting.findFirst({
      where: { id: stepId, bomId, tenantId, deletedAt: null },
    });
    if (!step) throw new NotFoundException(`Routing step ${stepId} not found`);

    if (dto.workCenterId) {
      const wc = await this.prisma.workCenter.findFirst({
        where: { id: dto.workCenterId, tenantId, deletedAt: null },
      });
      if (!wc) throw new NotFoundException(`Work center ${dto.workCenterId} not found`);
    }

    if (dto.stepNumber && dto.stepNumber !== step.stepNumber) {
      const conflict = await this.prisma.bomRouting.findFirst({
        where: { bomId, stepNumber: dto.stepNumber, id: { not: stepId }, deletedAt: null },
      });
      if (conflict) throw new ConflictException(`Step ${dto.stepNumber} already exists`);
    }

    const data: any = { updatedBy: userId };
    if (dto.stepNumber !== undefined)     data.stepNumber     = dto.stepNumber;
    if (dto.workCenterId)                 data.workCenterId   = dto.workCenterId;
    if (dto.description !== undefined)    data.description    = dto.description;
    if (dto.setupTime !== undefined)      data.setupTime      = new Decimal(dto.setupTime);
    if (dto.runTimePerUnit !== undefined) data.runTimePerUnit = new Decimal(dto.runTimePerUnit);
    if (dto.isActive !== undefined)       data.isActive       = dto.isActive;
    if (dto.notes !== undefined)          data.notes          = dto.notes;

    const updated = await this.prisma.bomRouting.update({
      where:   { id: stepId },
      data,
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

    await this.prisma.bomRouting.update({
      where: { id: stepId },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Routing step deleted', id: stepId };
  }

  // ── Routing: Labor Estimate ───────────────────────────────────────────────

  async getLaborEstimate(tenantId: string, bomId: string, quantity: number) {
    const bom = await this.findOne(tenantId, bomId);

    const steps = await this.prisma.bomRouting.findMany({
      where:   { bomId, tenantId, deletedAt: null, isActive: true },
      include: ROUTING_INCLUDE,
      orderBy: { stepNumber: 'asc' },
    });

    if (steps.length === 0) {
      return {
        bom: { id: bom.id, bomNumber: bom.bomNumber },
        quantity, steps: [],
        totalSetupHours: 0, totalRunHours: 0,
        totalLaborHours: 0, estimatedLaborCost: 0,
        message: 'No routing steps defined for this BOM',
      };
    }

    let totalSetupHours = 0;
    let totalRunHours   = 0;
    let totalCost       = 0;

    const stepDetails = steps.map(s => {
      const setup    = Number(s.setupTime);
      const runTotal = Number(s.runTimePerUnit) * quantity;
      const total    = setup + runTotal;
      const rate     = s.workCenter.costPerHour ? Number(s.workCenter.costPerHour) : 0;
      const cost     = total * rate;

      totalSetupHours += setup;
      totalRunHours   += runTotal;
      totalCost       += cost;

      return {
        stepNumber:     s.stepNumber,
        description:    s.description,
        workCenter:     s.workCenter,
        setupTime:      setup,
        runTimePerUnit: Number(s.runTimePerUnit),
        totalRunHours:  runTotal,
        totalHours:     total,
        costPerHour:    rate,
        estimatedCost:  cost,
      };
    });

    return {
      bom: { id: bom.id, bomNumber: bom.bomNumber, parentItem: bom.parentItem },
      quantity,
      steps:               stepDetails,
      totalSetupHours,
      totalRunHours,
      totalLaborHours:     totalSetupHours + totalRunHours,
      estimatedLaborCost:  totalCost,
    };
  }

  // ── Material Suggestions ──────────────────────────────────────────────────

  async getMaterialSuggestions(tenantId: string, bomId: string, quantity: number) {
    const bom = await this.findOne(tenantId, bomId);

    return bom.components.map((comp: any) => {
      const qtyRequired = comp.quantityPer * quantity;
      const scrapQty    = (qtyRequired * comp.scrapPercent) / 100;
      const qtyPlanned  = qtyRequired + scrapQty;

      return {
        itemId:          comp.componentItem.id,
        itemCode:        comp.componentItem.code,
        itemName:        comp.componentItem.name,
        qtyPlanned:      Math.ceil(qtyPlanned * 1000) / 1000,
        uom:             comp.uom,
        consumptionUom:  comp.consumptionUom ?? null,
        scrapPercent:    comp.scrapPercent,
        note: comp.scrapPercent > 0 ? `Includes ${comp.scrapPercent}% scrap` : undefined,
      };
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async generateBomNumber(tenantId: string): Promise<string> {
    const prefix = `BOM-${new Date().getFullYear()}`;
    const last   = await this.prisma.bom.findFirst({
      where:   { tenantId, bomNumber: { startsWith: prefix } },
      orderBy: { bomNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.bomNumber.split('-')[2]);
    return `${prefix}-${(n + 1).toString().padStart(4, '0')}`;
  }

  private formatBomResponse(bom: any) {
    return {
      ...bom,
      components: bom.components?.map((comp: any) => ({
        ...comp,
        quantityPer:  Number(comp.quantityPer),
        scrapPercent: Number(comp.scrapPercent),
      })),
      routings: bom.routings?.map((r: any) => this.formatRoutingStep(r)),
    };
  }

  private formatRoutingStep(step: any) {
    return {
      ...step,
      setupTime:      Number(step.setupTime),
      runTimePerUnit: Number(step.runTimePerUnit),
    };
  }
}