// ============================================================================
// FILE 2 — backend/src/modules/warehouses/warehouses.service.ts
// ============================================================================
 
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
 
@Injectable()
export class WarehousesService {
  constructor(private prisma: PrismaService) {}
 
  // ── Create ──────────────────────────────────────────────────────────────────
 
  async create(tenantId: string, userId: string, dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
    }
 
    return this.prisma.warehouse.create({
      data: {
        tenantId,
        code:                    dto.code,
        name:                    dto.name,
        warehouseType:           dto.warehouseType || 'regular',
        address:                 dto.address,
        isActive:                dto.isActive ?? true,
        locationTrackingEnabled: dto.locationTrackingEnabled ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }
 
  // ── Find All ─────────────────────────────────────────────────────────────────
 
  async findAll(tenantId: string) {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: {
          select: { stock: true, zones: true },
        },
      },
      orderBy: { code: 'asc' },
    });
 
    return warehouses.map(w => ({
      ...w,
      stockCount: w._count.stock,
      zoneCount:  w._count.zones,
    }));
  }
 
  // ── Find One ─────────────────────────────────────────────────────────────────
 
  async findOne(tenantId: string, id: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: { stock: true, zones: true },
        },
      },
    });
 
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${id} not found`);
    }
 
    return {
      ...warehouse,
      stockCount: warehouse._count.stock,
      zoneCount:  warehouse._count.zones,
    };
  }
 
  // ── Location Tree ─────────────────────────────────────────────────────────────
  // Returns full Zone → Aisle → Rack → Level → Bin hierarchy
 
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
 
  // ── Warehouse Stats ────────────────────────────────────────────────────────────
 
  async getStats(tenantId: string, warehouseId: string) {
    await this.findOne(tenantId, warehouseId);
 
    const stockAgg = await this.prisma.stock.aggregate({
      where: { tenantId, warehouseId },
      _sum:   { onHandQuantity: true },
      _count: { id: true },
    });
 
    const zoneCount  = await this.prisma.warehouseZone.count({ where: { warehouseId, deletedAt: null } });
    const aisleCount = await this.prisma.warehouseAisle.count({ where: { tenantId, deletedAt: null, zone: { warehouseId } } });
    const rackCount  = await this.prisma.warehouseRack.count({ where: { tenantId, deletedAt: null, aisle: { zone: { warehouseId } } } });
    const levelCount = await this.prisma.warehouseLevel.count({ where: { tenantId, deletedAt: null, rack: { aisle: { zone: { warehouseId } } } } });
    const binCount   = await this.prisma.warehouseBin.count({ where: { tenantId, deletedAt: null, level: { rack: { aisle: { zone: { warehouseId } } } } } });
 
    const levelCap = await this.prisma.warehouseLevel.aggregate({
      where: { tenantId, deletedAt: null, rack: { aisle: { zone: { warehouseId } } } },
      _sum:  { maxWeightKg: true, maxVolumeLtr: true, maxPallets: true },
    });
 
    const binCap = await this.prisma.warehouseBin.aggregate({
      where: { tenantId, deletedAt: null, level: { rack: { aisle: { zone: { warehouseId } } } } },
      _sum:  { maxWeightKg: true, maxVolumeLtr: true, maxPallets: true },
    });
 
    const totalCapacity = binCount > 0 ? {
      maxWeightKg:  binCap._sum.maxWeightKg,
      maxVolumeLtr: binCap._sum.maxVolumeLtr,
      maxPallets:   binCap._sum.maxPallets,
    } : {
      maxWeightKg:  levelCap._sum.maxWeightKg,
      maxVolumeLtr: levelCap._sum.maxVolumeLtr,
      maxPallets:   levelCap._sum.maxPallets,
    };
 
    return {
      stockLines:  stockAgg._count.id,
      totalOnHand: stockAgg._sum.onHandQuantity,
      locations: { zones: zoneCount, aisles: aisleCount, racks: rackCount, levels: levelCount, bins: binCount },
      capacity:  totalCapacity,
    };
  }
 
  // ── Update ───────────────────────────────────────────────────────────────────
 
  async update(tenantId: string, userId: string, id: string, dto: UpdateWarehouseDto) {
    await this.findOne(tenantId, id);
 
    if (dto.code) {
      const existing = await this.prisma.warehouse.findFirst({
        where: { tenantId, code: dto.code, id: { not: id }, deletedAt: null },
      });
      if (existing) throw new ConflictException(`Warehouse with code ${dto.code} already exists`);
    }
 
    return this.prisma.warehouse.update({
      where: { id },
      data:  { ...dto, updatedBy: userId },
    });
  }
 
  // ── Remove ───────────────────────────────────────────────────────────────────
 
  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.warehouse.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Warehouse deleted successfully', id };
  }
}