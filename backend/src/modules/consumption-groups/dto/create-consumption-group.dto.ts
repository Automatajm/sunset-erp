// --- consumption-groups/dto/create-consumption-group.dto.ts ---
import { IsString, IsOptional, IsUUID, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConsumptionGroupDto {
  // NOTE: code is auto-generated (CG-YYYY-NNNN) — not accepted from client

  @ApiProperty({ example: 'Industrial Adhesives' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'System UOM UUID — must be one of the tenant system UOMs' })
  @IsUUID()
  consumptionUomId: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
