// ============================================================================
// FILE: backend/src/modules/uom/uom.service.ts
// ============================================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AllQties {
  // Financial unit of record (ADR-019) — source of WAC + JE amounts
  purchaseQty: number;
  purchaseUom: string;
  // Warehouse operational unit (auxiliary — display only)
  storageQty: number;
  storageUom: string;
  // Production operational unit (auxiliary — display only)
  consumptionQty: number;
  consumptionUom: string;
}

export interface WacResult {
  newUnitCost: number; // new WAC per purchaseUom unit
  newPurchaseQty: number; // updated total purchaseQty in stock
  totalValue: number; // newPurchaseQty × newUnitCost
}

@Injectable()
export class UomService {
  constructor(private prisma: PrismaService) {}

  // ── Catalog queries ────────────────────────────────────────────────────────

  async findAllUnits(filters?: { type?: string; system?: string }) {
    const where: any = { isActive: true };
    if (filters?.type) where.type = filters.type;
    if (filters?.system) where.system = filters.system;
    return this.prisma.uomUnit.findMany({
      where,
      orderBy: [{ type: 'asc' }, { system: 'asc' }, { isBase: 'desc' }, { code: 'asc' }],
    });
  }

  async findOneUnit(id: string) {
    const unit = await this.prisma.uomUnit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException(`UOM unit ${id} not found`);
    return unit;
  }

  async findUnitByCode(code: string) {
    const unit = await this.prisma.uomUnit.findUnique({ where: { code } });
    if (!unit) throw new NotFoundException(`UOM unit with code ${code} not found`);
    return unit;
  }

  async findAllConversions() {
    return this.prisma.uomConversion.findMany({
      where: { isActive: true },
      include: {
        fromUom: { select: { code: true, name: true, type: true, system: true } },
        toUom: { select: { code: true, name: true, type: true, system: true } },
      },
      orderBy: [{ fromUom: { type: 'asc' } }, { fromUom: { code: 'asc' } }],
    });
  }

  async convert(fromCode: string, toCode: string, quantity: number) {
    if (fromCode === toCode) {
      return {
        fromUom: fromCode,
        toUom: toCode,
        inputQty: quantity,
        outputQty: quantity,
        factor: 1,
        isAutomatic: true,
      };
    }
    const from = await this.findUnitByCode(fromCode);
    const to = await this.findUnitByCode(toCode);
    const conversion = await this.prisma.uomConversion.findUnique({
      where: { fromUomId_toUomId: { fromUomId: from.id, toUomId: to.id } },
    });
    if (!conversion)
      throw new NotFoundException(
        `No conversion found from ${fromCode} to ${toCode}. Manual factor required.`,
      );
    const factor = Number(conversion.factor);
    const outputQty = Math.round(quantity * factor * 1_000_000) / 1_000_000;
    return {
      fromUom: fromCode,
      toUom: toCode,
      inputQty: quantity,
      outputQty,
      factor,
      isAutomatic: true,
    };
  }

  // Used internally by SupplierItemsService to auto-calculate conversion factors
  async getConversionFactor(fromUomId: string, toUomId: string): Promise<number | null> {
    if (fromUomId === toUomId) return 1;
    const conversion = await this.prisma.uomConversion.findUnique({
      where: { fromUomId_toUomId: { fromUomId, toUomId } },
    });
    return conversion ? Number(conversion.factor) : null;
  }

  // ── Core conversion methods (ADR-014) ──────────────────────────────────────

  /**
   * Calculate all 3 UOM quantities from a purchase quantity.
   *
   * Factor resolution chain (priority order):
   *  1. SupplierItem.conversionFactor (most specific — per supplier per item)
   *  2. UomConversion catalog (system-level bidirectional table)
   *  3. Item.purchaseToConsumptionFactor (manual fallback on Item master)
   *  4. 1.0 (identity — no conversion configured)
   *
   * purchaseUom = financial unit of record (ADR-019)
   * storageUom  = warehouse operational unit (auxiliary)
   * consumptionUom = production operational unit (auxiliary)
   */
  async calcAllQties(
    purchaseQty: number,
    itemId: string,
    tenantId: string,
    supplierItemId?: string,
  ): Promise<AllQties> {
    // Load item with UOM config
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, tenantId, deletedAt: null },
      include: {
        purchaseUom: { select: { id: true, code: true } },
        storageUom: { select: { id: true, code: true } },
        consumptionUom: { select: { id: true, code: true } },
      },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    // ── Determine purchase UOM ───────────────────────────────────────────────
    const purchaseUomCode = item.purchaseUom?.code ?? item.baseUom;

    // ── Determine storage UOM ────────────────────────────────────────────────
    const storageUomCode = item.storageUom?.code ?? item.baseUom;

    // ── Determine consumption UOM ────────────────────────────────────────────
    const consumptionUomCode = item.consumptionUom?.code ?? item.baseUom;

    // ── Resolve purchase → consumption factor ────────────────────────────────
    let purchaseToConsumptionFactor = 1;

    // 1. SupplierItem.conversionFactor (most specific)
    if (supplierItemId) {
      const si = await this.prisma.supplierItem.findFirst({
        where: { id: supplierItemId, tenantId, deletedAt: null },
      });
      if (si) purchaseToConsumptionFactor = Number(si.conversionFactor);
    }

    // 2. UomConversion catalog
    if (purchaseToConsumptionFactor === 1 && item.purchaseUomId && item.consumptionUomId) {
      const catalogFactor = await this.getConversionFactor(
        item.purchaseUomId,
        item.consumptionUomId,
      );
      if (catalogFactor !== null) purchaseToConsumptionFactor = catalogFactor;
    }

    // 3. Item.purchaseToConsumptionFactor (manual fallback)
    if (purchaseToConsumptionFactor === 1) {
      purchaseToConsumptionFactor = Number(item.purchaseToConsumptionFactor ?? 1);
    }
    // 4. Default: 1.0 (identity)

    // ── Resolve purchase → storage factor ────────────────────────────────────
    let purchaseToStorageFactor = 1;

    if (item.purchaseUomId && item.storageUomId && item.purchaseUomId !== item.storageUomId) {
      const catalogFactor = await this.getConversionFactor(item.purchaseUomId, item.storageUomId);
      if (catalogFactor !== null) {
        purchaseToStorageFactor = catalogFactor;
      } else {
        // Derive via consumption as intermediate:
        // purchase → consumption → storage
        const storageToConsumptionFactor = Number(item.storageToConsumptionFactor ?? 1);
        if (storageToConsumptionFactor !== 0) {
          purchaseToStorageFactor = purchaseToConsumptionFactor / storageToConsumptionFactor;
        }
      }
    }

    // ── Calculate all 3 quantities ───────────────────────────────────────────
    const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

    return {
      purchaseQty,
      purchaseUom: purchaseUomCode,
      storageQty: round6(purchaseQty * purchaseToStorageFactor),
      storageUom: storageUomCode,
      consumptionQty: round6(purchaseQty * purchaseToConsumptionFactor),
      consumptionUom: consumptionUomCode,
    };
  }

  /**
   * Calculate new Weighted Average Cost after a GRN receipt (ADR-019).
   * All quantities and costs are in purchaseUom — the financial unit of record.
   *
   * Formula:
   *   newWAC = (existingPurchaseQty × existingUnitCost + incomingPurchaseQty × incomingUnitCost)
   *            / (existingPurchaseQty + incomingPurchaseQty)
   */
  calcNewWAC(
    existingPurchaseQty: number,
    existingUnitCost: number,
    incomingPurchaseQty: number,
    incomingUnitCost: number,
  ): WacResult {
    const totalQty = existingPurchaseQty + incomingPurchaseQty;
    if (totalQty === 0) return { newUnitCost: 0, newPurchaseQty: 0, totalValue: 0 };

    const existingValue = existingPurchaseQty * existingUnitCost;
    const incomingValue = incomingPurchaseQty * incomingUnitCost;
    const newUnitCost = Math.round(((existingValue + incomingValue) / totalQty) * 10_000) / 10_000;
    const totalValue = Math.round(totalQty * newUnitCost * 100) / 100;

    return { newUnitCost, newPurchaseQty: totalQty, totalValue };
  }

  /**
   * Calculate financial value from any UOM quantity (ADR-019).
   * Always converts to purchaseUom first — never computes $ directly from
   * storageQty or consumptionQty.
   *
   * unitCost = WAC per purchaseUom unit (stored in Stock.unitCost)
   */
  calcFinancialValue(
    qty: number,
    uomType: 'purchase' | 'storage' | 'consumption',
    item: {
      unitCost: number;
      purchaseToConsumptionFactor: number;
      storageToConsumptionFactor: number;
    },
  ): number {
    const round2 = (n: number) => Math.round(n * 100) / 100;
    switch (uomType) {
      case 'purchase':
        // Direct — no conversion needed
        return round2(qty * item.unitCost);
      case 'storage': {
        // storage → consumption → purchase
        const consumptionQty = qty * item.storageToConsumptionFactor;
        const purchaseQty =
          item.purchaseToConsumptionFactor !== 0
            ? consumptionQty / item.purchaseToConsumptionFactor
            : consumptionQty;
        return round2(purchaseQty * item.unitCost);
      }
      case 'consumption': {
        // consumption → purchase
        const purchaseQty =
          item.purchaseToConsumptionFactor !== 0 ? qty / item.purchaseToConsumptionFactor : qty;
        return round2(purchaseQty * item.unitCost);
      }
    }
  }
}
