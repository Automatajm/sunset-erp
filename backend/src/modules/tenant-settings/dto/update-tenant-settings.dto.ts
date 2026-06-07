// --- tenant-settings/dto/update-tenant-settings.dto.ts ---
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'metric', description: 'metric | imperial | custom' })
  @IsOptional()
  @IsString()
  defaultUomSystem?: string;

  @ApiPropertyOptional({
    example: 'DOP',
    description: 'ISO 4217 monetary base currency (spec-021; catalog-validated)',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  baseCurrency?: string;

  @ApiPropertyOptional({ description: 'Volume system UOM ID (e.g. LTR)' })
  @IsOptional()
  @IsUUID()
  volumeBaseUomId?: string;

  @ApiPropertyOptional({ description: 'Mass system UOM ID (e.g. KG)' })
  @IsOptional()
  @IsUUID()
  massBaseUomId?: string;

  @ApiPropertyOptional({ description: 'Length system UOM ID (e.g. M)' })
  @IsOptional()
  @IsUUID()
  lengthBaseUomId?: string;

  @ApiPropertyOptional({ description: 'Area system UOM ID (e.g. M2)' })
  @IsOptional()
  @IsUUID()
  areaBaseUomId?: string;

  @ApiPropertyOptional({ description: 'Count system UOM ID (e.g. PCS)' })
  @IsOptional()
  @IsUUID()
  countBaseUomId?: string;

  @IsOptional()
  @IsUUID()
  timeBaseUomId?: string;
}
