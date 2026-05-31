// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/dto/create-assignment.dto.ts
// ============================================================================
import { IsUUID, IsOptional, IsArray, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'User ID to assign lines to' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'Zone IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds?: string[];

  @ApiPropertyOptional({ description: 'Aisle IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  aisleIds?: string[];

  @ApiPropertyOptional({ description: 'Level IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  levelIds?: string[];

  @ApiPropertyOptional({ description: 'Bin IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  binIds?: string[];

  @ApiPropertyOptional({ description: 'Category IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'MacroCategory IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  macroCategoryIds?: string[];

  @ApiPropertyOptional({ description: 'Specific item IDs to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
