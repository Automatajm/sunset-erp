// --- supplier-items/supplier-items.service.ts ---
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';
 
const INCLUDE = {
  supplier:    { select: { id: true, code: true, name: true } },
  item:        { select: { id: true, code: true, name: true, consumptionUomId: true, baseUom: true } },
  purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
};
 
@Injectable()
export class SupplierItemsService {
  constructor(
    private prisma:      PrismaService,
    private uomService:  UomService,
  ) {}
 
  async create(tenantId: string, userId: string, dto: CreateSupplierItemDto) {
    const existing = await this.prisma.supplierItem.findFirst({
      where: { tenantId, supplierId: dto.supplierId, itemId: dto.itemId, deletedAt: null },
    });
    if (existing) throw new ConflictException('This supplier already has an entry for this item');
 
    // Auto-calculate conversion factor from catalog when not explicitly provided
    let conversionFactor = dto.conversionFactor ?? 1;
    if (!dto.conversionFactor || dto.conversionFactor === 1) {
      const item = await this.prisma.item.findFirst({ where: { id: dto.itemId, tenantId } });
      if (item?.consumptionUomId && dto.purchaseUomId !== item.consumptionUomId) {
        const autoFactor = await this.uomService.getConversionFactor(dto.purchaseUomId, item.consumptionUomId);
        if (autoFactor) conversionFactor = autoFactor;
      }
    }
 
    if (dto.isPreferred) {
      await this.prisma.supplierItem.updateMany({
        where: { tenantId, itemId: dto.itemId, isPreferred: true, deletedAt: null },
        data:  { isPreferred: false },
      });
    }
 
    const si = await this.prisma.supplierItem.create({
      data: {
        tenantId,
        supplierId:       dto.supplierId,
        itemId:           dto.itemId,
        supplierItemCode: dto.supplierItemCode,
        supplierItemName: dto.supplierItemName,
        purchaseUomId:    dto.purchaseUomId,
        packSize:         dto.packSize ?? 1,
        conversionFactor,
        lastPrice:        dto.lastPrice,
        leadTimeDays:     dto.leadTimeDays ?? 0,
        moq:              dto.moq ?? 1,
        isPreferred:      dto.isPreferred ?? false,
        isActive:         dto.isActive ?? true,
        notes:            dto.notes,
        createdBy:        userId,
        updatedBy:        userId,
      },
      include: INCLUDE,
    });
 
    if (dto.isPreferred) {
      await this.prisma.item.update({ where: { id: dto.itemId }, data: { defaultSupplierId: dto.supplierId } });
    }
 
    return this.enrich(si);
  }
 
  async findAll(tenantId: string, filters?: { itemId?: string; supplierId?: string; isPreferred?: boolean }) {
    const where: any = { tenantId, deletedAt: null };
    if (filters?.itemId)                    where.itemId      = filters.itemId;
    if (filters?.supplierId)                where.supplierId  = filters.supplierId;
    if (filters?.isPreferred !== undefined)  where.isPreferred = filters.isPreferred;
 
    const rows = await this.prisma.supplierItem.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ isPreferred: 'desc' }, { supplier: { name: 'asc' } }],
    });
    return rows.map(r => this.enrich(r));
  }
 
  async findByItem(tenantId: string, itemId: string) {
    return this.findAll(tenantId, { itemId });
  }
 
  async findBySupplier(tenantId: string, supplierId: string) {
    return this.findAll(tenantId, { supplierId });
  }
 
  async findOne(tenantId: string, id: string) {
    const si = await this.prisma.supplierItem.findFirst({ where: { id, tenantId, deletedAt: null }, include: INCLUDE });
    if (!si) throw new NotFoundException(`SupplierItem ${id} not found`);
    return this.enrich(si);
  }
 
  async update(tenantId: string, userId: string, id: string, dto: UpdateSupplierItemDto) {
    const si = await this.findOne(tenantId, id);
 
    if (dto.isPreferred) {
      await this.prisma.supplierItem.updateMany({
        where: { tenantId, itemId: (si as any).itemId, isPreferred: true, id: { not: id }, deletedAt: null },
        data:  { isPreferred: false },
      });
      await this.prisma.item.update({
        where: { id: (si as any).itemId },
        data:  { defaultSupplierId: (si as any).supplierId },
      });
    }
 
    let conversionFactor = dto.conversionFactor;
    if (dto.purchaseUomId && !dto.conversionFactor) {
      const item = await this.prisma.item.findFirst({ where: { id: (si as any).itemId, tenantId } });
      if (item?.consumptionUomId) {
        const autoFactor = await this.uomService.getConversionFactor(dto.purchaseUomId, item.consumptionUomId);
        if (autoFactor) conversionFactor = autoFactor;
      }
    }
 
    const updated = await this.prisma.supplierItem.update({
      where:   { id },
      data:    { ...dto, ...(conversionFactor !== undefined ? { conversionFactor } : {}), updatedBy: userId },
      include: INCLUDE,
    });
    return this.enrich(updated);
  }
 
  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.supplierItem.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: userId } });
    return { message: 'Supplier item deleted successfully', id };
  }
 
  private enrich(si: any) {
    return {
      ...si,
      conversionPreview: `1 ${si.purchaseUom.code} = ${Number(si.conversionFactor)} ${si.item.baseUom}`,
    };
  }
}