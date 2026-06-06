// ============================================================================
// backend/src/modules/general-needs/mrp.service.ts
// MRP Engine — explodes Production Orders → GeneralNeed via ConsumptionGroups
// ============================================================================
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MrpGroupDemand {
  consumptionGroupId: string;
  consumptionGroupCode: string;
  consumptionGroupName: string;
  consumptionUomId: string;
  consumptionUomCode: string;
  totalQty: number; // aggregated in consumptionUom
  sources: {
    moId: string;
    moNumber: string;
    bomId: string;
    lineNumber: number;
    qtyFormulador: number;
    uomFormulador: string;
    qtyConverted: number;
    conversionFactor: number;
    plannedStart: Date | null;
  }[];
}

export interface MrpResult {
  gnId: string;
  gnNumber: string;
  linesCreated: number;
  groups: MrpGroupDemand[];
  warnings: string[];
}

// ── MRP Engine ────────────────────────────────────────────────────────────────

@Injectable()
export class MrpService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run MRP explosion for a set of Production Orders.
   * Creates or appends GeneralNeedLines to the given GeneralNeed.
   *
   * Flow:
   *   MO → BOM Components (consumptionGroupId, quantityPer × uom)
   *   → convert quantityPer [uom] → [consumptionUom] via UomConversion
   *   → multiply by MO quantity
   *   → aggregate by ConsumptionGroup
   *   → create GeneralNeedLine per group
   */
  async runMrp(
    tenantId: string,
    userId: string,
    gnId: string,
    moIds: string[],
  ): Promise<MrpResult> {
    // 1. Validate GeneralNeed exists and is in editable state
    const gn = await this.prisma.generalNeed.findFirst({
      where: { id: gnId, tenantId, deletedAt: null },
    });
    if (!gn) throw new NotFoundException(`General Need ${gnId} not found`);
    if (!['draft', 'in_progress'].includes(gn.status)) {
      throw new BadRequestException(
        `Cannot run MRP on General Need in status "${gn.status}". Must be draft or in_progress.`,
      );
    }

    // 2. Load Production Orders with BOM components.
    // NOTE: this whitelist (draft|released|in_progress) intentionally diverges from
    // the legacy explodeFromMos path (draft|confirmed) — unifying the semantics is
    // out of scope for spec-020; runMrp is the canonical MRP entry point.
    const mos = await this.prisma.productionOrder.findMany({
      where: {
        id: { in: moIds },
        tenantId,
        deletedAt: null,
        status: { in: ['draft', 'released', 'in_progress'] },
      },
    });

    if (mos.length === 0) {
      throw new NotFoundException(
        'No valid Production Orders found (must be draft, released, or in_progress)',
      );
    }

    const warnings: string[] = [];
    const demandMap = new Map<string, MrpGroupDemand>(); // key = consumptionGroupId

    // 3. Explode each MO's BOM
    for (const mo of mos) {
      if (!mo.bomId) {
        warnings.push(`MO ${mo.poNumber} has no BOM linked — skipped`);
        continue;
      }

      const components = await this.prisma.bomComponent.findMany({
        where: { bomId: mo.bomId, tenantId, deletedAt: null },
        include: {
          consumptionGroup: {
            select: {
              id: true,
              code: true,
              name: true,
              consumptionUomId: true,
              consumptionUom: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
          consumptionUom: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { lineNumber: 'asc' },
      });

      if (components.length === 0) {
        warnings.push(`BOM for MO ${mo.poNumber} has no components — skipped`);
        continue;
      }

      const moQty = Number(mo.quantityToProduce);

      for (const comp of components) {
        const cg = (comp as any).consumptionGroup;
        if (!cg) {
          warnings.push(
            `BOM component line ${comp.lineNumber} in MO ${mo.poNumber} has no ConsumptionGroup — skipped`,
          );
          continue;
        }

        // Resolve consumptionUom — prefer component's, fallback to group's
        const consUom = (comp as any).consumptionUom ?? cg.consumptionUom;
        if (!consUom) {
          warnings.push(`ConsumptionGroup "${cg.code}" has no system UOM configured — skipped`);
          continue;
        }

        const qtyFormulador = Number(comp.quantityPer) * moQty;
        const uomFormulador = comp.uom; // formulador UOM code (string)

        // 4. Convert formulador UOM → consumptionUom via UomConversion catalog
        let qtyConverted = qtyFormulador;
        let conversionFactor = 1;

        if (uomFormulador !== consUom.code) {
          // Look up conversion by code
          const fromUom = await this.prisma.uomUnit.findUnique({
            where: { code: uomFormulador },
          });

          if (!fromUom) {
            warnings.push(
              `UOM "${uomFormulador}" not found in catalog for MO ${mo.poNumber} component ${comp.lineNumber} — using 1:1`,
            );
          } else {
            const conversion = await this.prisma.uomConversion.findUnique({
              where: {
                fromUomId_toUomId: {
                  fromUomId: fromUom.id,
                  toUomId: consUom.id,
                },
              },
            });

            if (!conversion) {
              warnings.push(
                `No conversion found: ${uomFormulador} → ${consUom.code} ` +
                  `(MO ${mo.poNumber}, component ${comp.lineNumber}) — using 1:1`,
              );
            } else {
              conversionFactor = Number(conversion.factor);
              qtyConverted = Math.round(qtyFormulador * conversionFactor * 1_000_000) / 1_000_000;
            }
          }
        }

        // 5. Aggregate by ConsumptionGroup
        const key = cg.id;
        if (!demandMap.has(key)) {
          demandMap.set(key, {
            consumptionGroupId: cg.id,
            consumptionGroupCode: cg.code,
            consumptionGroupName: cg.name,
            consumptionUomId: consUom.id,
            consumptionUomCode: consUom.code,
            totalQty: 0,
            sources: [],
          });
        }

        const demand = demandMap.get(key)!;
        demand.totalQty = Math.round((demand.totalQty + qtyConverted) * 1_000_000) / 1_000_000;
        demand.sources.push({
          moId: mo.id,
          moNumber: mo.poNumber,
          bomId: mo.bomId,
          lineNumber: comp.lineNumber,
          qtyFormulador,
          uomFormulador,
          qtyConverted,
          conversionFactor,
          plannedStart: mo.plannedStartDate,
        });
      }
    }

    if (demandMap.size === 0) {
      throw new BadRequestException(
        'MRP explosion produced no demand — check BOM components and ConsumptionGroup configuration',
      );
    }

    // 6. Get last line number in GN
    const lastLine = await this.prisma.generalNeedLine.findFirst({
      where: { gnId, tenantId, deletedAt: null },
      orderBy: { lineNumber: 'desc' },
    });
    let nextLineNum = (lastLine?.lineNumber ?? 0) + 1;

    // 7+8. Create GeneralNeedLines (one per ConsumptionGroup) and flip the GN
    // source — atomically, so a failed run never leaves a half-exploded GN.
    const createdLines = await this.prisma.$transaction(async (tx) => {
      const lines: any[] = [];

      for (const [, demand] of demandMap) {
        // Find preferred supplier for any item in this group
        const preferredItem = await tx.item.findFirst({
          where: {
            tenantId,
            consumptionGroupId: demand.consumptionGroupId,
            deletedAt: null,
            isPurchasable: true,
          },
          include: {
            supplierItems: {
              where: { isPreferred: true, deletedAt: null },
              include: { supplier: { select: { id: true, code: true, name: true } } },
              take: 1,
            },
          },
        });

        const preferredSupplierId = preferredItem?.supplierItems?.[0]?.supplierId ?? null;
        const estimatedUnitCost = preferredItem?.supplierItems?.[0]?.lastPrice
          ? Number(preferredItem.supplierItems[0].lastPrice)
          : null;

        // Earliest required date from MO planned starts
        const requiredDate =
          demand.sources
            .map((s) => s.plannedStart)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(gn.periodEnd);

        // Build notes with source breakdown
        const notesLines = demand.sources.map(
          (s) =>
            `MO ${s.moNumber}: ${s.qtyFormulador} ${s.uomFormulador}` +
            (s.conversionFactor !== 1
              ? ` × ${s.conversionFactor} = ${s.qtyConverted} ${demand.consumptionUomCode}`
              : ''),
        );

        const line = await tx.generalNeedLine.create({
          data: {
            tenantId,
            gnId,
            lineNumber: nextLineNum++,
            consumptionGroupId: demand.consumptionGroupId,
            quantity: new Decimal(demand.totalQty),
            uom: demand.consumptionUomCode,
            requiredDate,
            suggestedSupplierId: preferredSupplierId,
            estimatedUnitCost: estimatedUnitCost ? new Decimal(estimatedUnitCost) : null,
            sourceType: 'mo',
            status: 'pending',
            notes: `MRP Explode — ${demand.consumptionGroupCode}\n${notesLines.join('\n')}`,
            createdBy: userId,
            updatedBy: userId,
          },
        });

        lines.push(line);
      }

      // 8. Update GN source to mrp_explode
      await tx.generalNeed.updateMany({
        where: { id: gnId, tenantId, deletedAt: null },
        data: { source: 'mrp_explode', status: 'in_progress', updatedBy: userId },
      });

      return lines;
    });

    return {
      gnId,
      gnNumber: gn.gnNumber,
      linesCreated: createdLines.length,
      groups: Array.from(demandMap.values()),
      warnings,
    };
  }
}
