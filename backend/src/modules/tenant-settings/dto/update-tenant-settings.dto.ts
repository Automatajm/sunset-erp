// --- tenant-settings/dto/update-tenant-settings.dto.ts ---
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
 
export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'metric', description: 'metric | imperial' })
  @IsOptional()
  @IsString()
  defaultUomSystem?: string;
 
  @ApiPropertyOptional({ description: 'Volume base UOM ID (LTR or GAL)' })
  @IsOptional()
  @IsUUID()
  volumeBaseUomId?: string;
 
  @ApiPropertyOptional({ description: 'Mass base UOM ID (KG or LB)' })
  @IsOptional()
  @IsUUID()
  massBaseUomId?: string;
 
  @ApiPropertyOptional({ description: 'Length base UOM ID (M or FT)' })
  @IsOptional()
  @IsUUID()
  lengthBaseUomId?: string;
 
  @ApiPropertyOptional({ description: 'Area base UOM ID (M2 or FT2)' })
  @IsOptional()
  @IsUUID()
  areaBaseUomId?: string;
}