// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/update-zone.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsIn, MaxLength } from 'class-validator';
import { ZONE_TYPES } from './create-zone.dto';

export class UpdateZoneDto {
  @ApiPropertyOptional({ example: 'STOR' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({ example: 'Storage Area' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'storage', enum: ZONE_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(ZONE_TYPES)
  @MaxLength(30)
  zoneType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
