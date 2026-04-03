// ============================================================================
// FILE: backend/src/modules/supplier-items/supplier-items.service.ts
// ============================================================================
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';

const INCLUDE = {
  supplier:    { select: { id: true, code: true, name: true } },
  item:        { select: { id: true, code: true, name: true, consumptionUomId: true, baseUom: true, purchaseUomId: true } },
  purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
};

@Injectable()
export class SupplierItemsService {
  constructor(
    private prisma:     PrismaService,
    private uomService: UomService,
  ) {}

  // ── UOM validation — core business rule ───────────────────────────────────
  // A SupplierItem's purchaseUomId MUST match Item.purchaseUomId.
  // If a supplier uses a different UOM for the same product, it's a different item.

  private async validatePurchaseUom(
    itemId: string,
    tenantId: string,
    purchaseUomId: string,
  ): Promise<void> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, tenantId },
      select: { code: true, name: true, purchaseUomId: true, purchaseUom: { select: { code: true, name: true } } },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    // If the item has no purchaseUomId set, block the supplier assignment
    if (!item.purchaseUomId) {
      throw new BadRequestException(
        `Item ${item.code} does not have a Purchase UOM configured. ` +
        `Set the item's Purchase UOM before assigning suppliers.`
      );
    }

    // Enforce UOM match
    if (item.purchaseUomId !== purchaseUomId) {
      const supplierUom = await this.prisma.uomUnit.findFirst({
        where: { id: purchaseUomId },
        select: { code: true, name: true },
      });
      throw new BadRequestException(
        `Purchase UOM mismatch. Item ${item.code} uses ${item.purchaseUom?.code ?? item.purchaseUomId} ` +
        `but supplier is configured with ${supplierUom?.code ?? purchaseUomId}. ` +
        `If this supplier sells the product in a different unit, create a separate item for that presentation.`
      );
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupplierItemDto) {
    // Enforce UOM rule before anything else
    await this.validatePurchaseUom(dto.itemId, tenantId, dto.purchaseUomId);

    // Check for existing entry — including soft-deleted ones
    const existing = await this.prisma.supplierItem.findFirst({
      where: { tenantId, supplierId: dto.supplierId, itemId: dto.itemId },
    });

    if (existing) {
      if (existing.deletedAt) {
        // Previously removed — reactivate and update
        const reactivated = await this.prisma.supplierItem.update({
          where: { id: existing.id },
          data: {
            deletedAt:        null,
            deletedBy:        null,
            isActive:         true,
            supplierItemCode: dto.supplierItemCode ?? existing.supplierItemCode,
            supplierItemName: dto.supplierItemName ?? existing.supplierItemName,
            purchaseUomId:    dto.purchaseUomId,
            packSize:         dto.packSize ?? existing.packSize,
            lastPrice:        dto.lastPrice ?? existing.lastPrice,
            leadTimeDays:     dto.leadTimeDays ?? existing.leadTimeDays,
            moq:              dto.moq ?? existing.moq,
            isPreferred:      dto.isPreferred ?? existing.isPreferred,
            notes:            dto.notes ?? existing.notes,
            updatedBy:        userId,
          },
          include: INCLUDE,
        });
        return this.enrich(reactivated);
      } else {
        throw new ConflictException('This supplier already has an active entry for this item');
      }
    }

    // conversionFactor = 1 since purchaseUom === item.purchaseUomId (same unit, no conversion needed)
    // The triple UOM conversions are handled by Item.purchaseToConsumptionFactor
    const conversionFactor = dto.conversionFactor ?? 1;

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
      await this.prisma.item.update({
        where: { id: dto.itemId },
        data:  { defaultSupplierId: dto.supplierId },
      });
    }

    return this.enrich(si);
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, filters?: { itemId?: string; supplierId?: string; isPreferred?: boolean }) {
    const where: any = { tenantId, deletedAt: null };
    if (filters?.itemId)                    where.itemId      = filters.itemId;
    if (filters?.supplierId)                where.supplierId  = filters.supplierId;
    if (filters?.isPreferred !== undefined) where.isPreferred = filters.isPreferred;

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
    const si = await this.prisma.supplierItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: INCLUDE,
    });
    if (!si) throw new NotFoundException(`SupplierItem ${id} not found`);
    return this.enrich(si);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateSupplierItemDto) {
    const si = await this.findOne(tenantId, id);

    // If purchaseUomId is being changed, validate it against the item
    if (dto.purchaseUomId) {
      await this.validatePurchaseUom((si as any).itemId, tenantId, dto.purchaseUomId);
    }

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

    const updated = await this.prisma.supplierItem.update({
      where:   { id },
      data:    { ...dto, updatedBy: userId },
      include: INCLUDE,
    });
    return this.enrich(updated);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.supplierItem.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Supplier item deleted successfully', id };
  }

  private enrich(si: any) {
    return {
      ...si,
      conversionPreview: `1 ${si.purchaseUom.code} = ${Number(si.conversionFactor)} ${si.item.baseUom}`,
    };
  }
}