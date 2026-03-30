// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/create-level.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsBoolean, IsNumber, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLevelDto {
  @ApiProperty({ example: 'uuid-rack-id', description: 'Parent rack UUID' })
  @IsUUID()
  rackId: string;

  @ApiProperty({ example: '01', description: 'Level code. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL' })
  @IsString()
  @MaxLength(10)
  code: string;

  @ApiPropertyOptional({ example: 'Level 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1000, description: 'Maximum weight capacity in kilograms' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxWeightKg?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Maximum volume capacity in liters' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxVolumeLtr?: number;

  @ApiPropertyOptional({ example: 4, description: 'Maximum number of pallets' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPallets?: number;
}