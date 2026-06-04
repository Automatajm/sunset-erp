// ============================================================================
// FILE: backend/src/modules/warehouses/warehouses.service.ts
// ============================================================================

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

const TYPE_PREFIX: Record<string, string> = {
  regular: 'REG',
  consignment: 'CON',
  transit: 'TRN',
};

@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate warehouse code ──────────────────────────────────────────

  private async generateCode(tenantId: string, warehouseType: string): Promise<string> {
    const prefix = `WH-${TYPE_PREFIX[warehouseType] ?? 'REG'}`;
    // NOTE: intentionally NOT scoped to `deletedAt: null`. The `@@unique([tenantId, code])`
    // constraint spans soft-deleted rows, so a soft-deleted warehouse still occupies its
    // code — filtering them out regenerates occupied codes and creates fail with P2002
    // (same convention as suppliers.service.ts generateCode).
    // The max is NUMERIC, not lexicographic: orderBy code desc ranks 'WH-REG-99' above
    // 'WH-REG-978', regenerating taken codes once suffix lengths diverge.
    const rows = await this.prisma.warehouse.findMany({
      where: { tenantId, code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.code.split('-').pop() ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(3, '0')}`;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateWarehouseDto) {
    const warehouseType = dto.warehouseType || 'regular';
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.generateCode(tenantId, warehouseType);

    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Warehouse with code ${code} already exists`);

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        warehouseType,
        address: dto.address ?? null,
        isActive: dto.isActive ?? true,
        locationTrackingEnabled: dto.locationTrackingEnabled ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  // ── Find All — enriched with capacity + occupancy ─────────────────────────
  // Returns per warehouse:
  //   stockCount, zoneCount
  //   capacityKg, capacityLtr, capacityPallets    — total configured capacity
  //   occupiedLines                               — stock lines count
  //   occupancyPct                                — stockLines / capacityPallets * 100
  //                                                 (null if no capacity configured)

  async findAll(tenantId: string) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { stock: true, zones: true } } },
      orderBy: { code: 'asc' },
    });

    // Aggregate capacity for ALL warehouses in one query per level type
    // then map by warehouseId

    // Level capacity (used when no bins)
    const levelCaps = await this.prisma.$queryRaw<
      {
        warehouse_id: string;
        cap_kg: number | null;
        cap_ltr: number | null;
        cap_pallets: number | null;
        bin_count: number;
      }[]
    >`
      SELECT
        z.warehouse_id,
        SUM(l.max_weight_kg)::float   AS cap_kg,
        SUM(l.max_volume_ltr)::float  AS cap_ltr,
        SUM(l.max_pallets)::int       AS cap_pallets,
        COUNT(b.id)::int              AS bin_count
      FROM in_wh_levels l
      JOIN in_wh_racks  r ON r.id = l.rack_id   AND r.deleted_at IS NULL
      JOIN in_wh_aisles a ON a.id = r.aisle_id  AND a.deleted_at IS NULL
      JOIN in_wh_zones  z ON z.id = a.zone_id   AND z.deleted_at IS NULL
      LEFT JOIN in_wh_bins b ON b.level_id = l.id AND b.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
        AND z.tenant_id = ${tenantId}::uuid
      GROUP BY z.warehouse_id
    `;

    // Bin capacity (overrides level capacity when bins exist)
    const binCaps = await this.prisma.$queryRaw<
      {
        warehouse_id: string;
        cap_kg: number | null;
        cap_ltr: number | null;
        cap_pallets: number | null;
      }[]
    >`
      SELECT
        z.warehouse_id,
        SUM(b.max_weight_kg)::float   AS cap_kg,
        SUM(b.max_volume_ltr)::float  AS cap_ltr,
        SUM(b.max_pallets)::int       AS cap_pallets
      FROM in_wh_bins   b
      JOIN in_wh_levels l ON l.id = b.level_id  AND l.deleted_at IS NULL
      JOIN in_wh_racks  r ON r.id = l.rack_id   AND r.deleted_at IS NULL
      JOIN in_wh_aisles a ON a.id = r.aisle_id  AND a.deleted_at IS NULL
      JOIN in_wh_zones  z ON z.id = a.zone_id   AND z.deleted_at IS NULL
      WHERE b.deleted_at IS NULL
        AND z.tenant_id = ${tenantId}::uuid
      GROUP BY z.warehouse_id
    `;

    // Build maps
    const levelMap = new Map(levelCaps.map((r) => [r.warehouse_id, r]));
    const binMap = new Map(binCaps.map((r) => [r.warehouse_id, r]));

    return warehouses.map((w) => {
      const lc = levelMap.get(w.id);
      const bc = binMap.get(w.id);

      // Use bin capacity if bins exist, otherwise level capacity
      const hasBins = lc ? lc.bin_count > 0 : false;
      const capKg = hasBins ? (bc?.cap_kg ?? null) : (lc?.cap_kg ?? null);
      const capLtr = hasBins ? (bc?.cap_ltr ?? null) : (lc?.cap_ltr ?? null);
      const capPallets = hasBins ? (bc?.cap_pallets ?? null) : (lc?.cap_pallets ?? null);

      const stockCount = w._count.stock;

      // Occupancy % — uses pallets as primary metric, falls back to lines vs capacity
      // If no capacity configured → null (not applicable)
      const occupancyPct =
        capPallets && capPallets > 0
          ? Math.min(100, Math.round((stockCount / capPallets) * 100))
          : null;

      return {
        ...w,
        stockCount,
        zoneCount: w._count.zones,
        // Capacity totals
        capacityKg: capKg ? Number(capKg) : null,
        capacityLtr: capLtr ? Number(capLtr) : null,
        capacityPallets: capPallets ? Number(capPallets) : null,
        // Occupancy
        occupancyPct,
      };
    });
  }

  // ── Find One ──────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { stock: true, zones: true } } },
    });
    if (!warehouse) throw new NotFoundException(`Warehouse with ID ${id} not found`);
    return {
      ...warehouse,
      stockCount: warehouse._count.stock,
      zoneCount: warehouse._count.zones,
    };
  }

  // ── Location Tree ─────────────────────────────────────────────────────────

  async getLocationTree(tenantId: string, warehouseId: string) {
    await this.findOne(tenantId, warehouseId);
    return this.prisma.warehouseZone.findMany({
      where: { warehouseId, tenantId, deletedAt: null },
      include: {
        aisles: {
          where: { deletedAt: null },
          include: {
            racks: {
              where: { deletedAt: null },
              include: {
                levels: {
                  where: { deletedAt: null },
                  include: {
                    bins: {
                      where: { deletedAt: null },
                      include: { _count: { select: { stock: true } } },
                      orderBy: { code: 'asc' },
                    },
                    _count: { select: { stock: true, bins: true } },
                  },
                  orderBy: { code: 'asc' },
                },
              },
              orderBy: { code: 'asc' },
            },
          },
          orderBy: { code: 'asc' },
        },
        _count: { select: { aisles: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  // ── Warehouse Stats ───────────────────────────────────────────────────────

  async getStats(tenantId: string, warehouseId: string) {
    await this.findOne(tenantId, warehouseId);

    const stockAgg = await this.prisma.stock.aggregate({
      where: { tenantId, warehouseId },
      _sum: { onHandQuantity: true },
      _count: { id: true },
    });

    const zoneCount = await this.prisma.warehouseZone.count({
      where: { tenantId, warehouseId, deletedAt: null },
    });
    const aisleCount = await this.prisma.warehouseAisle.count({
      where: { tenantId, deletedAt: null, zone: { warehouseId } },
    });
    const rackCount = await this.prisma.warehouseRack.count({
      where: { tenantId, deletedAt: null, aisle: { zone: { warehouseId } } },
    });
    const levelCount = await this.prisma.warehouseLevel.count({
      where: { tenantId, deletedAt: null, rack: { aisle: { zone: { warehouseId } } } },
    });
    const binCount = await this.prisma.warehouseBin.count({
      where: { tenantId, deletedAt: null, level: { rack: { aisle: { zone: { warehouseId } } } } },
    });

    const levelCap = await this.prisma.warehouseLevel.aggregate({
      where: { tenantId, deletedAt: null, rack: { aisle: { zone: { warehouseId } } } },
      _sum: { maxWeightKg: true, maxVolumeLtr: true, maxPallets: true },
    });
    const binCap = await this.prisma.warehouseBin.aggregate({
      where: { tenantId, deletedAt: null, level: { rack: { aisle: { zone: { warehouseId } } } } },
      _sum: { maxWeightKg: true, maxVolumeLtr: true, maxPallets: true },
    });

    const totalCapacity =
      binCount > 0
        ? {
            maxWeightKg: binCap._sum.maxWeightKg,
            maxVolumeLtr: binCap._sum.maxVolumeLtr,
            maxPallets: binCap._sum.maxPallets,
          }
        : {
            maxWeightKg: levelCap._sum.maxWeightKg,
            maxVolumeLtr: levelCap._sum.maxVolumeLtr,
            maxPallets: levelCap._sum.maxPallets,
          };

    const capPallets = totalCapacity.maxPallets ? Number(totalCapacity.maxPallets) : null;
    const occupancyPct =
      capPallets && capPallets > 0
        ? Math.min(100, Math.round((stockAgg._count.id / capPallets) * 100))
        : null;

    return {
      stockLines: stockAgg._count.id,
      totalOnHand: stockAgg._sum.onHandQuantity,
      occupancyPct,
      locations: {
        zones: zoneCount,
        aisles: aisleCount,
        racks: rackCount,
        levels: levelCount,
        bins: binCount,
      },
      capacity: {
        maxWeightKg: totalCapacity.maxWeightKg ? Number(totalCapacity.maxWeightKg) : null,
        maxVolumeLtr: totalCapacity.maxVolumeLtr ? Number(totalCapacity.maxVolumeLtr) : null,
        maxPallets: totalCapacity.maxPallets ? Number(totalCapacity.maxPallets) : null,
      },
    };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateWarehouseDto) {
    await this.findOne(tenantId, id);
    if (dto.code) {
      const codeUpper = dto.code.trim().toUpperCase();
      const existing = await this.prisma.warehouse.findFirst({
        where: { tenantId, code: codeUpper, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictException(`Warehouse with code ${codeUpper} already exists`);
      dto.code = codeUpper;
    }
    // Tenant-scoped write: the write itself enforces tenancy, not just the preceding findOne.
    await this.prisma.warehouse.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.findOne(tenantId, id);
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    // Tenant-scoped soft delete: the write itself enforces tenancy.
    await this.prisma.warehouse.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Warehouse deleted successfully', id };
  }
}
