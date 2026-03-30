// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/create-bin.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsBoolean, IsNumber, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBinDto {
  @ApiProperty({ example: 'uuid-level-id', description: 'Parent level UUID' })
  @IsUUID()
  levelId: string;

  @ApiProperty({ example: '01', description: 'Bin code. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL-BIN' })
  @IsString()
  @MaxLength(10)
  code: string;

  @ApiPropertyOptional({ example: 'Bin 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'standard',
    description: 'Bin type: standard | pallet | big_bag | tank | silo | ibc | container | bulk',
    default: 'standard',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  binType?: string;

  @ApiPropertyOptional({ example: 25000, description: 'Maximum weight capacity in kilograms' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Maximum volume capacity in liters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxVolumeLtr?: number;

  @ApiPropertyOptional({ example: 1, description: 'Maximum number of pallets' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPallets?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Allow multiple SKUs in the same bin. Set false for bulk bins (e.g. sugar silo)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  allowMixedItems?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '25T sugar big bag — zone A' })
  @IsOptional()
  @IsString()
  notes?: string;
}