// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/update-bin.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsIn, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BIN_TYPES } from './create-bin.dto';

export class UpdateBinDto {
  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ example: 'Bin 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'standard', enum: BIN_TYPES })
  @IsOptional()
  @IsString()
  @IsIn(BIN_TYPES)
  @MaxLength(30)
  binType?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxVolumeLtr?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPallets?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMixedItems?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
