// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/update-level.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateLevelDto {
  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ example: 'Level 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxVolumeLtr?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPallets?: number;
}
