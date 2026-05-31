// --- tenant-settings/tenant-settings.module.ts ---
import { Module } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { TenantSettingsController } from './tenant-settings.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
