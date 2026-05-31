// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/update-aisle.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class UpdateAisleDto {
  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ example: 'Aisle 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
