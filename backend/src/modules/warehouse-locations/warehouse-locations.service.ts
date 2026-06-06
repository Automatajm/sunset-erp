// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/warehouse-locations.service.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  // ── Shared helpers ──────────────────────────────────────────────────────────

  // The @@unique indexes ignore deletedAt, so a soft-deleted sibling still
  // occupies its code at the DB level — invisible to the deletedAt:null
  // dup-checks. Surface that collision as 409, never an unhandled 500.
  private async mapP2002<T>(promise: Promise<T>, message: string): Promise<T> {
    try {
      return await promise;
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new ConflictException(message);
      throw e;
    }
  }

  private swapPrefix(fullCode: string, oldPrefix: string, newPrefix: string): string {
    return newPrefix + fullCode.slice(oldPrefix.length);
  }

  // ── fullCode cascade — prefix-swap every non-deleted descendant, tier by
  // tier, inside the caller's transaction. Each tier is fetched once by parent
  // ids (never a per-row refetch of the ancestor chain).
  private async cascadeAisleDescendants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    aisleIds: string[],
    oldPrefix: string,
    newPrefix: string,
  ) {
    if (aisleIds.length === 0) return;
    const racks = await tx.warehouseRack.findMany({
      where: { aisleId: { in: aisleIds }, tenantId, deletedAt: null },
      select: { id: true, fullCode: true },
    });
    for (const rack of racks) {
      await tx.warehouseRack.update({
        where: { id: rack.id },
        data: { fullCode: this.swapPrefix(rack.fullCode, oldPrefix, newPrefix), updatedBy: userId },
      });
    }
    await this.cascadeRackDescendants(
      tx,
      tenantId,
      userId,
      racks.map((r) => r.id),
      oldPrefix,
      newPrefix,
    );
  }

  private async cascadeRackDescendants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    rackIds: string[],
    oldPrefix: string,
    newPrefix: string,
  ) {
    if (rackIds.length === 0) return;
    const levels = await tx.warehouseLevel.findMany({
      where: { rackId: { in: rackIds }, tenantId, deletedAt: null },
      select: { id: true, fullCode: true },
    });
    for (const level of levels) {
      await tx.warehouseLevel.update({
        where: { id: level.id },
        data: {
          fullCode: this.swapPrefix(level.fullCode, oldPrefix, newPrefix),
          updatedBy: userId,
        },
      });
    }
    await this.cascadeLevelDescendants(
      tx,
      tenantId,
      userId,
      levels.map((l) => l.id),
      oldPrefix,
      newPrefix,
    );
  }

  private async cascadeLevelDescendants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    levelIds: string[],
    oldPrefix: string,
    newPrefix: string,
  ) {
    if (levelIds.length === 0) return;
    const bins = await tx.warehouseBin.findMany({
      where: { levelId: { in: levelIds }, tenantId, deletedAt: null },
      select: { id: true, fullCode: true },
    });
    for (const bin of bins) {
      await tx.warehouseBin.update({
        where: { id: bin.id },
        data: { fullCode: this.swapPrefix(bin.fullCode, oldPrefix, newPrefix), updatedBy: userId },
      });
    }
  }

  // ── ZONES ──────────────────────────────────────────────────────────────────

  async createZone(tenantId: string, userId: string, dto: CreateZoneDto) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId, deletedAt: null },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const code = dto.code.toUpperCase();
    const existing = await this.prisma.warehouseZone.findFirst({
      where: { warehouseId: dto.warehouseId, code, tenantId, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Zone ${code} already exists in this warehouse`);

    return this.mapP2002(
      this.prisma.warehouseZone.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          code,
          name: dto.name,
          zoneType: dto.zoneType ?? 'storage',
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        },
      }),
      `Zone ${code} already exists in this warehouse (possibly soft-deleted)`,
    );
  }

  async findZones(tenantId: string, warehouseId: string) {
    const zones = await this.prisma.warehouseZone.findMany({
      where: { warehouseId, tenantId, deletedAt: null },
      include: { _count: { select: { aisles: true } } },
      orderBy: { code: 'asc' },
    });
    return { zones, count: zones.length };
  }

  async updateZone(tenantId: string, userId: string, id: string, dto: UpdateZoneDto) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    const newCode = dto.code?.toUpperCase();
    const codeChanged = newCode !== undefined && newCode !== zone.code;
    if (codeChanged) {
      const duplicate = await this.prisma.warehouseZone.findFirst({
        where: {
          warehouseId: zone.warehouseId,
          code: newCode,
          tenantId,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate)
        throw new ConflictException(`Zone ${newCode} already exists in this warehouse`);
    }

    const data = { ...dto, ...(newCode ? { code: newCode } : {}), updatedBy: userId };

    if (!codeChanged) {
      return this.prisma.warehouseZone.update({ where: { id }, data });
    }

    // Zone code is the root prefix of every descendant fullCode — cascade it.
    return this.mapP2002(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouseZone.update({ where: { id }, data });
        const aisles = await tx.warehouseAisle.findMany({
          where: { zoneId: id, tenantId, deletedAt: null },
          select: { id: true, fullCode: true },
        });
        for (const aisle of aisles) {
          await tx.warehouseAisle.update({
            where: { id: aisle.id },
            data: {
              fullCode: this.swapPrefix(aisle.fullCode, zone.code, newCode),
              updatedBy: userId,
            },
          });
        }
        await this.cascadeAisleDescendants(
          tx,
          tenantId,
          userId,
          aisles.map((a) => a.id),
          zone.code,
          newCode,
        );
        return updated;
      }),
      `Zone ${newCode} already exists in this warehouse (possibly soft-deleted)`,
    );
  }

  async removeZone(tenantId: string, userId: string, id: string) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!zone) throw new NotFoundException('Zone not found');

    const activeAisles = await this.prisma.warehouseAisle.count({
      where: { zoneId: id, tenantId, deletedAt: null },
    });
    if (activeAisles > 0) {
      throw new BadRequestException('Cannot delete zone with active aisles. Delete aisles first.');
    }

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
      where: { zoneId: dto.zoneId, code: dto.code, tenantId, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Aisle ${dto.code} already exists in zone ${zone.code}`);

    return this.mapP2002(
      this.prisma.warehouseAisle.create({
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
      }),
      `Aisle ${dto.code} already exists in zone ${zone.code} (possibly soft-deleted)`,
    );
  }

  async findAisles(tenantId: string, zoneId: string) {
    const aisles = await this.prisma.warehouseAisle.findMany({
      where: { zoneId, tenantId, deletedAt: null },
      include: { _count: { select: { racks: true } } },
      orderBy: { code: 'asc' },
    });
    return { aisles, count: aisles.length };
  }

  async updateAisle(tenantId: string, userId: string, id: string, dto: UpdateAisleDto) {
    const aisle = await this.prisma.warehouseAisle.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { zone: true },
    });
    if (!aisle) throw new NotFoundException('Aisle not found');

    const codeChanged = dto.code !== undefined && dto.code !== aisle.code;
    if (codeChanged) {
      const duplicate = await this.prisma.warehouseAisle.findFirst({
        where: { zoneId: aisle.zoneId, code: dto.code, tenantId, deletedAt: null, id: { not: id } },
      });
      if (duplicate)
        throw new ConflictException(`Aisle ${dto.code} already exists in zone ${aisle.zone.code}`);
    }

    if (!codeChanged) {
      return this.prisma.warehouseAisle.update({
        where: { id },
        data: { ...dto, updatedBy: userId },
      });
    }

    const newFullCode = `${aisle.zone.code}-${dto.code}`;
    return this.mapP2002(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouseAisle.update({
          where: { id },
          data: { ...dto, fullCode: newFullCode, updatedBy: userId },
        });
        await this.cascadeAisleDescendants(tx, tenantId, userId, [id], aisle.fullCode, newFullCode);
        return updated;
      }),
      `Aisle ${dto.code} already exists in zone ${aisle.zone.code} (possibly soft-deleted)`,
    );
  }

  async removeAisle(tenantId: string, userId: string, id: string) {
    const aisle = await this.prisma.warehouseAisle.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!aisle) throw new NotFoundException('Aisle not found');

    const activeRacks = await this.prisma.warehouseRack.count({
      where: { aisleId: id, tenantId, deletedAt: null },
    });
    if (activeRacks > 0) {
      throw new BadRequestException('Cannot delete aisle with active racks. Delete racks first.');
    }

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
      where: { aisleId: dto.aisleId, code: dto.code, tenantId, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Rack ${dto.code} already exists in aisle ${aisle.fullCode}`);

    return this.mapP2002(
      this.prisma.warehouseRack.create({
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
      }),
      `Rack ${dto.code} already exists in aisle ${aisle.fullCode} (possibly soft-deleted)`,
    );
  }

  async findRacks(tenantId: string, aisleId: string) {
    const racks = await this.prisma.warehouseRack.findMany({
      where: { aisleId, tenantId, deletedAt: null },
      include: { _count: { select: { levels: true } } },
      orderBy: { code: 'asc' },
    });
    return { racks, count: racks.length };
  }

  async updateRack(tenantId: string, userId: string, id: string, dto: UpdateRackDto) {
    const rack = await this.prisma.warehouseRack.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { aisle: true },
    });
    if (!rack) throw new NotFoundException('Rack not found');

    const codeChanged = dto.code !== undefined && dto.code !== rack.code;
    if (codeChanged) {
      const duplicate = await this.prisma.warehouseRack.findFirst({
        where: {
          aisleId: rack.aisleId,
          code: dto.code,
          tenantId,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (duplicate)
        throw new ConflictException(
          `Rack ${dto.code} already exists in aisle ${rack.aisle.fullCode}`,
        );
    }

    if (!codeChanged) {
      return this.prisma.warehouseRack.update({
        where: { id },
        data: { ...dto, updatedBy: userId },
      });
    }

    const newFullCode = `${rack.aisle.fullCode}-${dto.code}`;
    return this.mapP2002(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouseRack.update({
          where: { id },
          data: { ...dto, fullCode: newFullCode, updatedBy: userId },
        });
        await this.cascadeRackDescendants(tx, tenantId, userId, [id], rack.fullCode, newFullCode);
        return updated;
      }),
      `Rack ${dto.code} already exists in aisle ${rack.aisle.fullCode} (possibly soft-deleted)`,
    );
  }

  async removeRack(tenantId: string, userId: string, id: string) {
    const rack = await this.prisma.warehouseRack.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!rack) throw new NotFoundException('Rack not found');

    const activeLevels = await this.prisma.warehouseLevel.count({
      where: { rackId: id, tenantId, deletedAt: null },
    });
    if (activeLevels > 0) {
      throw new BadRequestException('Cannot delete rack with active levels. Delete levels first.');
    }

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
      where: { rackId: dto.rackId, code: dto.code, tenantId, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Level ${dto.code} already exists in rack ${rack.fullCode}`);

    return this.mapP2002(
      this.prisma.warehouseLevel.create({
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
      }),
      `Level ${dto.code} already exists in rack ${rack.fullCode} (possibly soft-deleted)`,
    );
  }

  async findLevels(tenantId: string, rackId: string) {
    const levels = await this.prisma.warehouseLevel.findMany({
      where: { rackId, tenantId, deletedAt: null },
      include: { _count: { select: { bins: true, stock: true } } },
      orderBy: { code: 'asc' },
    });
    return { levels, count: levels.length };
  }

  async updateLevel(tenantId: string, userId: string, id: string, dto: UpdateLevelDto) {
    const level = await this.prisma.warehouseLevel.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { rack: true },
    });
    if (!level) throw new NotFoundException('Level not found');

    const codeChanged = dto.code !== undefined && dto.code !== level.code;
    if (codeChanged) {
      const duplicate = await this.prisma.warehouseLevel.findFirst({
        where: { rackId: level.rackId, code: dto.code, tenantId, deletedAt: null, id: { not: id } },
      });
      if (duplicate)
        throw new ConflictException(
          `Level ${dto.code} already exists in rack ${level.rack.fullCode}`,
        );
    }

    if (!codeChanged) {
      return this.prisma.warehouseLevel.update({
        where: { id },
        data: { ...dto, updatedBy: userId },
      });
    }

    const newFullCode = `${level.rack.fullCode}-${dto.code}`;
    return this.mapP2002(
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouseLevel.update({
          where: { id },
          data: { ...dto, fullCode: newFullCode, updatedBy: userId },
        });
        await this.cascadeLevelDescendants(tx, tenantId, userId, [id], level.fullCode, newFullCode);
        return updated;
      }),
      `Level ${dto.code} already exists in rack ${level.rack.fullCode} (possibly soft-deleted)`,
    );
  }

  async removeLevel(tenantId: string, userId: string, id: string) {
    const level = await this.prisma.warehouseLevel.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!level) throw new NotFoundException('Level not found');

    const hasBins = await this.prisma.warehouseBin.count({
      where: { levelId: id, tenantId, deletedAt: null },
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
      where: { levelId: dto.levelId, code: dto.code, tenantId, deletedAt: null },
    });
    if (existing)
      throw new ConflictException(`Bin ${dto.code} already exists in level ${level.fullCode}`);

    return this.mapP2002(
      this.prisma.warehouseBin.create({
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
      }),
      `Bin ${dto.code} already exists in level ${level.fullCode} (possibly soft-deleted)`,
    );
  }

  async findBins(tenantId: string, levelId: string) {
    const bins = await this.prisma.warehouseBin.findMany({
      where: { levelId, tenantId, deletedAt: null },
      include: { _count: { select: { stock: true } } },
      orderBy: { code: 'asc' },
    });
    return { bins, count: bins.length };
  }

  async updateBin(tenantId: string, userId: string, id: string, dto: UpdateBinDto) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { level: true },
    });
    if (!bin) throw new NotFoundException('Bin not found');

    const codeChanged = dto.code !== undefined && dto.code !== bin.code;
    if (codeChanged) {
      const duplicate = await this.prisma.warehouseBin.findFirst({
        where: { levelId: bin.levelId, code: dto.code, tenantId, deletedAt: null, id: { not: id } },
      });
      if (duplicate)
        throw new ConflictException(
          `Bin ${dto.code} already exists in level ${bin.level.fullCode}`,
        );
    }

    // Bins are leaves — no descendant cascade, just recompute own fullCode.
    const fullCode = codeChanged ? `${bin.level.fullCode}-${dto.code}` : undefined;
    return this.mapP2002(
      this.prisma.warehouseBin.update({
        where: { id },
        data: { ...dto, ...(fullCode ? { fullCode } : {}), updatedBy: userId },
      }),
      `Bin ${dto.code} already exists in level ${bin.level.fullCode} (possibly soft-deleted)`,
    );
  }

  async removeBin(tenantId: string, userId: string, id: string) {
    const bin = await this.prisma.warehouseBin.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!bin) throw new NotFoundException('Bin not found');

    // Stock is owned by stock-transactions (no service API yet — documented
    // exception in spec-014). The model has no deletedAt: it is a live
    // quantity snapshot, so tenantId + onHandQuantity is the full scope.
    const hasStock = await this.prisma.stock.count({
      where: { binId: id, tenantId, onHandQuantity: { gt: 0 } },
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
