// --- consumption-groups/consumption-groups.service.ts ---
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateConsumptionGroupDto } from './dto/create-consumption-group.dto';
import { UpdateConsumptionGroupDto } from './dto/update-consumption-group.dto';

const INCLUDE = {
  consumptionUom: true,
  _count: { select: { items: true } },
};

@Injectable()
export class ConsumptionGroupsService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-code CG-YYYY-NNNN ──────────────────────────────────────────────

  private async generateCode(tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `CG-${year}`;
    const last   = await this.prisma.consumptionGroup.findFirst({
      where:   { tenantId, code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const n = parseInt(last.code.split('-')[2], 10);
    return `${prefix}-${(isNaN(n) ? 1 : n + 1).toString().padStart(4, '0')}`;
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateConsumptionGroupDto) {
    const code = await this.generateCode(tenantId);
    return this.prisma.consumptionGroup.create({
      data: {
        tenantId,
        code,
        name:             dto.name,
        description:      dto.description,
        consumptionUomId: dto.consumptionUomId,
        isActive:         dto.isActive ?? true,
        createdBy:        userId,
        updatedBy:        userId,
      },
      include: INCLUDE,
    });
  }

  // ── Find All ────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.consumptionGroup.findMany({
      where:   { tenantId, deletedAt: null },
      include: INCLUDE,
      orderBy: { code: 'asc' },
    });
  }

  // ── Find One ────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const cg = await this.prisma.consumptionGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        consumptionUom: true,
        items: {
          where:  { deletedAt: null },
          select: {
            id: true, code: true, name: true, baseUom: true,
            purchaseToConsumptionFactor: true,
            storageToConsumptionFactor:  true,
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
    return this.prisma.consumptionGroup.update({
      where:   { id },
      data:    { ...dto, updatedBy: userId },
      include: INCLUDE,
    });
  }

  // ── Remove ──────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.consumptionGroup.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Consumption group deleted successfully', id };
  }
}