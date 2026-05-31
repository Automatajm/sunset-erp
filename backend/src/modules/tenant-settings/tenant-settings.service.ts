// --- tenant-settings/tenant-settings.service.ts ---
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

const INCLUDE = {
  volumeBaseUom: true,
  massBaseUom: true,
  lengthBaseUom: true,
  areaBaseUom: true,
  countBaseUom: true,
  timeBaseUom: true,
};

@Injectable()
export class TenantSettingsService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(tenantId: string) {
    const existing = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      include: INCLUDE,
    });
    if (existing) return existing;
    return this.prisma.tenantSettings.create({
      data: { tenantId, defaultUomSystem: 'metric' },
      include: INCLUDE,
    });
  }

  async update(tenantId: string, userId: string, dto: UpdateTenantSettingsDto) {
    await this.getOrCreate(tenantId);
    return this.prisma.tenantSettings.update({
      where: { tenantId },
      data: { ...dto, updatedBy: userId },
      include: INCLUDE,
    });
  }

  /**
   * Returns only the configured system UOMs as a flat list.
   * Used by ConsumptionGroup, Item and BOM modals to restrict UOM selection.
   * A null entry means that UOM type has not been configured yet.
   */
  async getSystemUoms(tenantId: string) {
    const s = await this.getOrCreate(tenantId);
    return {
      volume: s.volumeBaseUom ?? null,
      mass: s.massBaseUom ?? null,
      length: s.lengthBaseUom ?? null,
      area: s.areaBaseUom ?? null,
      count: s.countBaseUom ?? null,
      time: s.timeBaseUom ?? null,
      // Flat list for use in SearchSelect — only configured ones
      list: [
        s.volumeBaseUom,
        s.massBaseUom,
        s.lengthBaseUom,
        s.areaBaseUom,
        s.countBaseUom,
        s.timeBaseUom,
      ].filter(Boolean),
    };
  }
}
