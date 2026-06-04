// --- consumption-groups/consumption-groups.service.ts ---
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateConsumptionGroupDto } from './dto/create-consumption-group.dto';
import { UpdateConsumptionGroupDto } from './dto/update-consumption-group.dto';

const INCLUDE = {
  consumptionUom: true,
  _count: { select: { items: true } },
};

@Injectable()
export class ConsumptionGroupsService {
  constructor(
    private prisma: PrismaService,
    private uomService: UomService,
  ) {}

  // ── Auto-code CG-YYYY-NNNN ──────────────────────────────────────────────

  private async generateCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CG-${year}`;
    const last = await this.prisma.consumptionGroup.findFirst({
      where: { tenantId, code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.code.split('-')[2], 10);
    return `${prefix}-${(isNaN(n) ? 1 : n + 1).toString().padStart(4, '0')}`;
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateConsumptionGroupDto) {
    // Validate the UOM FK via the owning module (404 instead of FK-violation 500),
    // BEFORE generating the code so failed creates do not burn sequence numbers.
    await this.uomService.findOneUnit(dto.consumptionUomId);
    const code = await this.generateCode(tenantId);
    return this.prisma.consumptionGroup.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        description: dto.description,
        consumptionUomId: dto.consumptionUomId,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
      include: INCLUDE,
    });
  }

  // ── Find All ────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    const consumptionGroups = await this.prisma.consumptionGroup.findMany({
      where: { tenantId, deletedAt: null },
      include: INCLUDE,
      orderBy: { code: 'asc' },
    });
    return { consumptionGroups, count: consumptionGroups.length };
  }

  // ── Find One ────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const cg = await this.prisma.consumptionGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        consumptionUom: true,
        items: {
          where: { deletedAt: null },
          select: {
            id: true,
            code: true,
            name: true,
            baseUom: true,
            purchaseToConsumptionFactor: true,
            storageToConsumptionFactor: true,
            stock: { select: { onHandQuantity: true } },
          },
        },
      },
    });
    if (!cg) throw new NotFoundException(`ConsumptionGroup ${id} not found`);
    const totalConsumptionQty = cg.items.reduce((sum, item) => {
      const onHand = item.stock.reduce((s, st) => s + Number(st.onHandQuantity), 0);
      return sum + onHand * Number(item.purchaseToConsumptionFactor);
    }, 0);
    return { ...cg, totalConsumptionQty: Math.round(totalConsumptionQty * 1000) / 1000 };
  }

  // ── Update ──────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateConsumptionGroupDto) {
    await this.findOne(tenantId, id);
    if (dto.consumptionUomId !== undefined) {
      // Same FK validation as create — 404 instead of FK-violation 500 (spec-008).
      await this.uomService.findOneUnit(dto.consumptionUomId);
    }
    // Tenant scope enforced at the write itself (updateMany — Prisma update() only
    // accepts unique wheres), then re-fetch to preserve the response shape.
    await this.prisma.consumptionGroup.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.prisma.consumptionGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: INCLUDE,
    });
  }

  // ── Remove ──────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const cg = await this.findOne(tenantId, id);
    // Referential guard: never orphan the MRP aggregation (spec-008). findOne already
    // loads the group's ACTIVE items via its own relation — no items-module query needed.
    if (cg.items.length > 0)
      throw new BadRequestException(
        `Cannot delete: ${cg.items.length} items still assigned to this consumption group`,
      );
    await this.prisma.consumptionGroup.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Consumption group deleted successfully', id };
  }
}
