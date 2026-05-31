// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/warehouse-locations.service.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateAisleDto } from './dto/create-aisle.dto';
import { UpdateAisleDto } from './dto/update-aisle.dto';
import { CreateRackDto } from './dto/create-rack.dto';
import { UpdateRackDto } from './dto/update-rack.dto';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateBinDto } from './dto/create-bin.dto';
import { UpdateBinDto } from './dto/update-bin.dto';

@Injectable()
export class WarehouseLocationsService {
  constructor(private prisma: PrismaService) {}

  // ── ZONES ──────────────────────────────────────────────────────────────────

  async createZone(tenantId: string, userId: string, dto: CreateZoneDto) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const existing = await this.prisma.warehouseZone.findFirst({
      where: { warehouseId: dto.warehouseId, code: dto.code.toUpperCase(), deletedAt: null },
    });
    if (existing) throw new ConflictException(`Zone ${dto.code} already exists in this warehouse`);

    return this.prisma.warehouseZone.create({
      data: {
        tenantId,
        warehouseId: dto.warehouseId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        zoneType: dto.zoneType ?? 'storage',
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findZones(tenantId: string, warehouseId: string) {
    return this.prisma.warehouseZone.findMany({
      where: { warehouseId, tenantId, deletedAt: null },
      include: { _count: { select: { aisles: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateZone(tenantId: string, userId: string, id: string, dto: UpdateZoneDto) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    return this.prisma.warehouseZone.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  async removeZone(tenantId: string, userId: string, id: string) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    await this.prisma.warehouseZone.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Zone deleted successfully', id };
  }

  // ── AISLES — fullCode = ZONE.code + "-" + aisle.code ──────────────────────

  async createAisle(tenantId: string, userId: string, dto: CreateAisleDto) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: dto.zoneId, tenantId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    const existing = await this.prisma.warehouseAisle.findFirst({
      where: { zoneId: dto.zoneId, code: dto.code, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Aisle ${dto.code} already exists in zone ${zone.code}`);

    return this.prisma.warehouseAisle.create({
      data: {
        tenantId,
        zoneId: dto.zoneId,
        code: dto.code,
        name: dto.name ?? null,
        fullCode: `${zone.code}-${dto.code}`,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findAisles(tenantId: string, zoneId: string) {
    return this.prisma.warehouseAisle.findMany({
      where: { zoneId, tenantId, deletedAt: null },
      include: { _count: { select: { racks: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateAisle(tenantId: string, userId: string, id: string, dto: UpdateAisleDto) {
    const aisle = await this.prisma.warehouseAisle.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { zone: true },
    });
    if (!aisle) throw new NotFoundException('Aisle not found');

    const fullCode = dto.code ? `${aisle.zone.code}-${dto.code}` : undefined;

    return this.prisma.warehouseAisle.update({
      where: { id },
      data: { ...dto, ...(fullCode ? { fullCode } : {}), updatedBy: userId },
    });
  }

  async removeAisle(tenantId: string, userId: string, id: string) {
    const aisle = await this.prisma.warehouseAisle.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!aisle) throw new NotFoundException('Aisle not found');

    await this.prisma.warehouseAisle.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Aisle deleted successfully', id };
  }

  // ── RACKS — fullCode = AISLE.fullCode + "-" + rack.code ───────────────────

  async createRack(tenantId: string, userId: string, dto: CreateRackDto) {
    const aisle = await this.prisma.warehouseAisle.findFirst({
      where: { id: dto.aisleId, tenantId, deletedAt: null },
    });
    if (!aisle) throw new NotFoundException('Aisle not found');

    const existing = await this.prisma.warehouseRack.findFirst({
      where: { aisleId: dto.aisleId, code: dto.code, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Rack ${dto.code} already exists in aisle ${aisle.fullCode}`);

    return this.prisma.warehouseRack.create({
      data: {
        tenantId,
        aisleId: dto.aisleId,
        code: dto.code,
        name: dto.name ?? null,
        fullCode: `${aisle.fullCode}-${dto.code}`,
        isActive: dto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findRacks(tenantId: string, aisleId: string) {
    return this.prisma.warehouseRack.findMany({
      where: { aisleId, tenantId, deletedAt: null },
      include: { _count: { select: { levels: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateRack(tenantId: string, userId: string, id: string, dto: UpdateRackDto) {
    const rack = await this.prisma.warehouseRack.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { aisle: true },
    });
    if (!rack) throw new NotFoundException('Rack not found');

    const fullCode = dto.code ? `${rack.aisle.fullCode}-${dto.code}` : undefined;

    return this.prisma.warehouseRack.update({
      where: { id },
      data: { ...dto, ...(fullCode ? { fullCode } : {}), updatedBy: userId },
    });
  }

  async removeRack(tenantId: string, userId: string, id: string) {
    const rack = await this.prisma.warehouseRack.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!rack) throw new NotFoundException('Rack not found');

    await this.prisma.warehouseRack.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Rack deleted successfully', id };
  }

  // ── LEVELS — fullCode = RACK.fullCode + "-" + level.code ──────────────────

  async createLevel(tenantId: string, userId: string, dto: CreateLevelDto) {
    const rack = await this.prisma.warehouseRack.findFirst({
      where: { id: dto.rackId, tenantId, deletedAt: null },
    });
    if (!rack) throw new NotFoundException('Rack not found');

    const existing = await this.prisma.warehouseLevel.findFirst({
      where: { rackId: dto.rackId, code: dto.code, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Level ${dto.code} already exists in rack ${rack.fullCode}`);

    return this.prisma.warehouseLevel.create({
      data: {
        tenantId,
        rackId: dto.rackId,
        code: dto.code,
        name: dto.name ?? null,
        fullCode: `${rack.fullCode}-${dto.code}`,
        isActive: dto.isActive ?? true,
        maxWeightKg: dto.maxWeightKg ?? null,
        maxVolumeLtr: dto.maxVolumeLtr ?? null,
        maxPallets: dto.maxPallets ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findLevels(tenantId: string, rackId: string) {
    return this.prisma.warehouseLevel.findMany({
      where: { rackId, tenantId, deletedAt: null },
      include: { _count: { select: { bins: true, stock: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateLevel(tenantId: string, userId: string, id: string, dto: UpdateLevelDto) {
    const level = await this.prisma.warehouseLevel.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { rack: true },
    });
    if (!level) throw new NotFoundException('Level not found');

    const fullCode = dto.code ? `${level.rack.fullCode}-${dto.code}` : undefined;

    return this.prisma.warehouseLevel.update({
      where: { id },
      data: { ...dto, ...(fullCode ? { fullCode } : {}), updatedBy: userId },
    });
  }

  async removeLevel(tenantId: string, userId: string, id: string) {
    const level = await this.prisma.warehouseLevel.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!level) throw new NotFoundException('Level not found');

    const hasBins = await this.prisma.warehouseBin.count({
      where: { levelId: id, deletedAt: null },
    });
    if (hasBins > 0) {
      throw new BadRequestException('Cannot delete level with active bins. Delete bins first.');
    }

    await this.prisma.warehouseLevel.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Level deleted successfully', id };
  }

  // ── BINS — fullCode = LEVEL.fullCode + "-" + bin.code ─────────────────────

  async createBin(tenantId: string, userId: string, dto: CreateBinDto) {
    const level = await this.prisma.warehouseLevel.findFirst({
      where: { id: dto.levelId, tenantId, deletedAt: null },
    });
    if (!level) throw new NotFoundException('Level not found');

    const existing = await this.prisma.warehouseBin.findFirst({
      where: { levelId: dto.levelId, code: dto.code, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Bin ${dto.code} already exists in level ${level.fullCode}`);

    return this.prisma.warehouseBin.create({
      data: {
        tenantId,
        levelId: dto.levelId,
        code: dto.code,
        name: dto.name ?? null,
        fullCode: `${level.fullCode}-${dto.code}`,
        binType: dto.binType ?? 'standard',
        maxWeightKg: dto.maxWeightKg ?? null,
        maxVolumeLtr: dto.maxVolumeLtr ?? null,
        maxPallets: dto.maxPallets ?? null,
        allowMixedItems: dto.allowMixedItems ?? true,
        isActive: dto.isActive ?? true,
        notes: dto.notes ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findBins(tenantId: string, levelId: string) {
    return this.prisma.warehouseBin.findMany({
      where: { levelId, tenantId, deletedAt: null },
      include: { _count: { select: { stock: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async updateBin(tenantId: string, userId: string, id: string, dto: UpdateBinDto) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { level: true },
    });
    if (!bin) throw new NotFoundException('Bin not found');

    const fullCode = dto.code ? `${bin.level.fullCode}-${dto.code}` : undefined;

    return this.prisma.warehouseBin.update({
      where: { id },
      data: { ...dto, ...(fullCode ? { fullCode } : {}), updatedBy: userId },
    });
  }

  async removeBin(tenantId: string, userId: string, id: string) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!bin) throw new NotFoundException('Bin not found');

    const hasStock = await this.prisma.stock.count({
      where: { binId: id, onHandQuantity: { gt: 0 } },
    });
    if (hasStock > 0) {
      throw new BadRequestException('Cannot delete bin with stock on hand. Move stock first.');
    }

    await this.prisma.warehouseBin.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Bin deleted successfully', id };
  }
}
