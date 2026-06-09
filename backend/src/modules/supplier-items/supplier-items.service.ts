// ============================================================================
// FILE: backend/src/modules/supplier-items/supplier-items.service.ts
// ============================================================================
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';
import { UpdateSupplierItemPriceDto } from './dto/update-price.dto';

const INCLUDE = {
  supplier: { select: { id: true, code: true, name: true } },
  item: {
    select: {
      id: true,
      code: true,
      name: true,
      consumptionUomId: true,
      baseUom: true,
      purchaseUomId: true,
    },
  },
  purchaseUom: { select: { id: true, code: true, name: true, type: true, system: true } },
};

@Injectable()
export class SupplierItemsService {
  constructor(
    private prisma: PrismaService,
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
      where: { id: itemId, tenantId, deletedAt: null },
      select: {
        code: true,
        name: true,
        purchaseUomId: true,
        purchaseUom: { select: { code: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    // If the item has no purchaseUomId set, block the supplier assignment
    if (!item.purchaseUomId) {
      throw new BadRequestException(
        `Item ${item.code} does not have a Purchase UOM configured. ` +
          `Set the item's Purchase UOM before assigning suppliers.`,
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
          `If this supplier sells the product in a different unit, create a separate item for that presentation.`,
      );
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupplierItemDto) {
    // The supplier must exist in this tenant — the FK alone is global, so an
    // unchecked id could link another tenant's supplier (or 500 on bogus ids).
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    // Enforce UOM rule before anything else
    await this.validatePurchaseUom(dto.itemId, tenantId, dto.purchaseUomId);

    // Check for existing entry — including soft-deleted ones
    const existing = await this.prisma.supplierItem.findFirst({
      where: { tenantId, supplierId: dto.supplierId, itemId: dto.itemId },
    });

    if (existing) {
      if (existing.deletedAt) {
        // Previously removed — reactivate and update (tenant-scoped at the write)
        await this.prisma.supplierItem.updateMany({
          where: { id: existing.id, tenantId },
          data: {
            deletedAt: null,
            deletedBy: null,
            isActive: true,
            supplierItemCode: dto.supplierItemCode ?? existing.supplierItemCode,
            supplierItemName: dto.supplierItemName ?? existing.supplierItemName,
            purchaseUomId: dto.purchaseUomId,
            packSize: dto.packSize ?? existing.packSize,
            lastPrice: dto.lastPrice ?? existing.lastPrice,
            leadTimeDays: dto.leadTimeDays ?? existing.leadTimeDays,
            moq: dto.moq ?? existing.moq,
            isPreferred: dto.isPreferred ?? existing.isPreferred,
            notes: dto.notes ?? existing.notes,
            updatedBy: userId,
          },
        });
        const reactivated = await this.prisma.supplierItem.findFirst({
          where: { id: existing.id, tenantId },
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
        data: { isPreferred: false },
      });
    }

    let si;
    try {
      si = await this.prisma.supplierItem.create({
        data: {
          tenantId,
          supplierId: dto.supplierId,
          itemId: dto.itemId,
          supplierItemCode: dto.supplierItemCode,
          supplierItemName: dto.supplierItemName,
          purchaseUomId: dto.purchaseUomId,
          packSize: dto.packSize ?? 1,
          conversionFactor,
          lastPrice: dto.lastPrice,
          leadTimeDays: dto.leadTimeDays ?? 0,
          moq: dto.moq ?? 1,
          isPreferred: dto.isPreferred ?? false,
          isActive: dto.isActive ?? true,
          notes: dto.notes,
          // ── commercial / pricing v2 (recovered) ──
          currency: dto.currency ?? 'USD',
          incoterm: dto.incoterm,
          paymentTerms: dto.paymentTerms,
          priceValidFrom: dto.priceValidFrom ? new Date(dto.priceValidFrom) : null,
          priceValidUntil: dto.priceValidUntil ? new Date(dto.priceValidUntil) : null,
          priceAlertDays: dto.priceAlertDays ?? 30,
          qualityRating: dto.qualityRating,
          isBlocked: dto.isBlocked ?? false,
          blockedReason: dto.blockedReason,
          createdBy: userId,
          updatedBy: userId,
        },
        include: INCLUDE,
      });
    } catch (e) {
      // @@unique([tenantId, supplierId, itemId]) can race between the existence
      // check above and this create.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException('This supplier already has an active entry for this item');
      }
      throw e;
    }

    if (dto.isPreferred) {
      await this.prisma.item.updateMany({
        where: { id: dto.itemId, tenantId },
        data: { defaultSupplierId: dto.supplierId },
      });
    }

    return this.enrich(si);
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    filters?: { itemId?: string; supplierId?: string; isPreferred?: boolean },
  ) {
    const where: any = { tenantId, deletedAt: null };
    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    if (filters?.isPreferred !== undefined) where.isPreferred = filters.isPreferred;

    const rows = await this.prisma.supplierItem.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ isPreferred: 'desc' }, { supplier: { name: 'asc' } }],
    });
    const supplierItems = rows.map((r) => this.enrich(r));
    return { supplierItems, count: supplierItems.length };
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
        where: {
          tenantId,
          itemId: (si as any).itemId,
          isPreferred: true,
          id: { not: id },
          deletedAt: null,
        },
        data: { isPreferred: false },
      });
      await this.prisma.item.updateMany({
        where: { id: (si as any).itemId, tenantId },
        data: { defaultSupplierId: (si as any).supplierId },
      });
    }

    // Date-only fields arrive as ISO strings from class-validator (@IsDateString
    // does not transform) — coerce to Date so Prisma accepts them.
    const data: any = { ...dto, updatedBy: userId };
    if (dto.priceValidFrom !== undefined)
      data.priceValidFrom = dto.priceValidFrom ? new Date(dto.priceValidFrom) : null;
    if (dto.priceValidUntil !== undefined)
      data.priceValidUntil = dto.priceValidUntil ? new Date(dto.priceValidUntil) : null;

    // Tenant-scoped at the write itself, then re-fetch for the enriched response.
    await this.prisma.supplierItem.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
    return this.findOne(tenantId, id);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const si: any = await this.findOne(tenantId, id);
    await this.prisma.supplierItem.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    // Removing the preferred entry must not leave Item.defaultSupplierId dangling.
    if (si.isPreferred) {
      await this.prisma.item.updateMany({
        where: { id: si.itemId, tenantId },
        data: { defaultSupplierId: null },
      });
    }

    return { message: 'Supplier item deleted successfully', id };
  }

  // ── Expiring prices ──────────────────────────────────────────────────────────
  // No window → every priced row that has an expiry date.
  // With a window → rows expiring within `daysAhead` days (already-expired included).

  async expiringPrices(tenantId: string, daysAhead?: number) {
    const where: any = { tenantId, deletedAt: null, priceValidUntil: { not: null } };
    if (daysAhead != null) {
      const cutoff = this.today();
      cutoff.setDate(cutoff.getDate() + daysAhead);
      where.priceValidUntil = { not: null, lte: cutoff };
    }
    const rows = await this.prisma.supplierItem.findMany({
      where,
      include: INCLUDE,
      orderBy: { priceValidUntil: 'asc' },
    });
    return rows.map((r) => {
      const enriched = this.enrich(r);
      // The alerts tab reads expiryStatus / daysUntilExpiry (aliases of the enriched fields).
      return {
        ...enriched,
        expiryStatus: enriched.priceExpiryStatus,
        daysUntilExpiry: enriched.priceExpiryDaysLeft,
      };
    });
  }

  // ── Counts ───────────────────────────────────────────────────────────────────

  async countsBySupplier(tenantId: string): Promise<Record<string, number>> {
    const groups = await this.prisma.supplierItem.groupBy({
      by: ['supplierId'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g: any) => [g.supplierId, g._count._all]));
  }

  async countsByItem(tenantId: string): Promise<Record<string, number>> {
    const groups = await this.prisma.supplierItem.groupBy({
      by: ['itemId'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
    return Object.fromEntries(groups.map((g: any) => [g.itemId, g._count._all]));
  }

  // ── Price history ────────────────────────────────────────────────────────────

  async priceHistory(tenantId: string, id: string) {
    // findOne enforces the tenant scope + 404 before we expose any history.
    await this.findOne(tenantId, id);
    return this.prisma.supplierItemPriceHistory.findMany({
      where: { tenantId, supplierItemId: id },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // ── Update price (writes lastPrice + appends a history row) ───────────────────

  async updatePrice(tenantId: string, userId: string, id: string, dto: UpdateSupplierItemPriceDto) {
    const si: any = await this.findOne(tenantId, id);

    // If sourced from an RFQ, the RFQ must belong to this tenant — never trust
    // a raw FK from the body (cross-tenant write leak).
    if (dto.rfqId) {
      const rfq = await this.prisma.rfq.findFirst({
        where: { id: dto.rfqId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!rfq) throw new NotFoundException(`RFQ ${dto.rfqId} not found`);
    }

    const currency = dto.currency ?? si.currency ?? 'USD';
    const validFrom = new Date(dto.validFrom);
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    await this.prisma.supplierItem.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        lastPrice: dto.price,
        currency,
        priceValidFrom: validFrom,
        priceValidUntil: validUntil,
        updatedBy: userId,
      },
    });

    await this.prisma.supplierItemPriceHistory.create({
      data: {
        tenantId,
        supplierItemId: id,
        price: dto.price,
        currency,
        validFrom,
        validUntil,
        source: dto.source ?? 'manual',
        rfqId: dto.rfqId ?? null,
        notes: dto.notes ?? null,
        createdBy: userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private today(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Price-expiry state used by the supplier/item tables and the alerts tab.
  // Thresholds: critical ≤ 7d, warning ≤ priceAlertDays (default 30), else ok.
  private computeExpiry(
    lastPrice: unknown,
    priceValidUntil: Date | null | undefined,
    priceAlertDays: number | null | undefined,
  ): { priceExpiryStatus: string; priceExpiryDaysLeft: number | null } {
    if (lastPrice == null) return { priceExpiryStatus: 'no_price', priceExpiryDaysLeft: null };
    if (!priceValidUntil) return { priceExpiryStatus: 'no_expiry', priceExpiryDaysLeft: null };

    const until = new Date(priceValidUntil);
    until.setHours(0, 0, 0, 0);
    const daysLeft = Math.round((until.getTime() - this.today().getTime()) / 86_400_000);

    let priceExpiryStatus: string;
    if (daysLeft < 0) priceExpiryStatus = 'expired';
    else if (daysLeft === 0) priceExpiryStatus = 'expires_today';
    else if (daysLeft <= 7) priceExpiryStatus = 'critical';
    else if (daysLeft <= (priceAlertDays ?? 30)) priceExpiryStatus = 'warning';
    else priceExpiryStatus = 'ok';

    return { priceExpiryStatus, priceExpiryDaysLeft: daysLeft };
  }

  private enrich(si: any) {
    return {
      ...si,
      conversionPreview: `1 ${si.purchaseUom.code} = ${Number(si.conversionFactor)} ${si.item.baseUom}`,
      ...this.computeExpiry(si.lastPrice, si.priceValidUntil, si.priceAlertDays),
    };
  }
}
