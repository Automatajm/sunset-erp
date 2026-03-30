// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/create-aisle.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateAisleDto {
  @ApiProperty({ example: 'uuid-zone-id', description: 'Parent zone UUID' })
  @IsUUID()
  zoneId: string;

  @ApiProperty({ example: '01', description: 'Aisle code. fullCode auto-generated: ZONE-AISLE' })
  @IsString()
  @MaxLength(10)
  code: string;

  @ApiPropertyOptional({ example: 'Aisle 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}