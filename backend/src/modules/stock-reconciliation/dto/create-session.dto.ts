// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/dto/create-session.dto.ts
// ============================================================================
import { IsString, IsOptional, IsArray, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional }                    from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({ description: 'Warehouse to count', example: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Count date (YYYY-MM-DD), defaults to today' })
  @IsOptional()
  @IsDateString()
  countDate?: string;

  @ApiPropertyOptional({
    description: 'Specific item IDs to include. Empty = all items in warehouse.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}