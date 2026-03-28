// --- tenant-settings/tenant-settings.service.ts ---
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
 
const INCLUDE = {
  volumeBaseUom: true,
  massBaseUom:   true,
  lengthBaseUom: true,
  areaBaseUom:   true,
};
 
@Injectable()
export class TenantSettingsService {
  constructor(private prisma: PrismaService) {}
 
  async getOrCreate(tenantId: string) {
    const existing = await this.prisma.tenantSettings.findUnique({ where: { tenantId }, include: INCLUDE });
    if (existing) return existing;
    return this.prisma.tenantSettings.create({ data: { tenantId, defaultUomSystem: 'metric' }, include: INCLUDE });
  }
 
  async update(tenantId: string, userId: string, dto: UpdateTenantSettingsDto) {
    await this.getOrCreate(tenantId);
    return this.prisma.tenantSettings.update({
      where:   { tenantId },
      data:    { ...dto, updatedBy: userId },
      include: INCLUDE,
    });
  }
}