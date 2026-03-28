// --- consumption-groups/consumption-groups.service.ts ---
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateConsumptionGroupDto } from './dto/create-consumption-group.dto';
import { UpdateConsumptionGroupDto } from './dto/update-consumption-group.dto';
 
@Injectable()
export class ConsumptionGroupsService {
  constructor(private prisma: PrismaService) {}
 
  async create(tenantId: string, userId: string, dto: CreateConsumptionGroupDto) {
    const existing = await this.prisma.consumptionGroup.findFirst({ where: { tenantId, code: dto.code, deletedAt: null } });
    if (existing) throw new ConflictException(`ConsumptionGroup code ${dto.code} already exists`);
    return this.prisma.consumptionGroup.create({
      data:    { tenantId, ...dto, isActive: dto.isActive ?? true, createdBy: userId, updatedBy: userId },
      include: { consumptionUom: true, _count: { select: { items: true } } },
    });
  }
 
  async findAll(tenantId: string) {
    return this.prisma.consumptionGroup.findMany({
      where:   { tenantId, deletedAt: null },
      include: { consumptionUom: true, _count: { select: { items: true } } },
      orderBy: { code: 'asc' },
    });
  }
 
  async findOne(tenantId: string, id: string) {
    const cg = await this.prisma.consumptionGroup.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        consumptionUom: true,
        items: {
          where:  { deletedAt: null },
          select: {
            id: true, code: true, name: true, baseUom: true,
            purchaseToConsumptionFactor: true, storageToConsumptionFactor: true,
            stock: { select: { onHandQuantity: true } },
          },
        },
      },
    });
    if (!cg) throw new NotFoundException(`ConsumptionGroup ${id} not found`);
 
    // Aggregate total qty in consumptionUom across all items in the group
    const totalConsumptionQty = cg.items.reduce((sum, item) => {
      const onHand = item.stock.reduce((s, st) => s + Number(st.onHandQuantity), 0);
      return sum + onHand * Number(item.purchaseToConsumptionFactor);
    }, 0);
 
    return { ...cg, totalConsumptionQty: Math.round(totalConsumptionQty * 1000) / 1000 };
  }
 
  async update(tenantId: string, userId: string, id: string, dto: UpdateConsumptionGroupDto) {
    await this.findOne(tenantId, id);
    return this.prisma.consumptionGroup.update({
      where:   { id },
      data:    { ...dto, updatedBy: userId },
      include: { consumptionUom: true, _count: { select: { items: true } } },
    });
  }
 
  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.consumptionGroup.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: userId } });
    return { message: 'Consumption group deleted successfully', id };
  }
}