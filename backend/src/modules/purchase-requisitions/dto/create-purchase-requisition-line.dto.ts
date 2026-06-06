import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsDateString,
  Min,
  Max,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseRequisitionLineDto {
  @ApiPropertyOptional({ description: 'Catalog item ID (null = generic)' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ enum: ['catalog', 'pending_item'], default: 'catalog' })
  @IsOptional()
  @IsEnum(['catalog', 'pending_item'])
  itemStatus?: string;

  @ApiPropertyOptional({ description: 'Free-text description when item not in catalog' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  genericDescription?: string;

  @ApiPropertyOptional({ description: 'Technical specification for generic item' })
  @IsOptional()
  @IsString()
  genericSpec?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0.001)
  @Max(999999999999) // Decimal(15,3) capacity
  quantity: number;

  @ApiProperty({ example: 'KG' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999999) // Decimal(15,4) capacity
  unitEstimate?: number;

  @ApiProperty({ description: 'Required delivery date' })
  @IsDateString()
  requiredDate: string;

  @ApiPropertyOptional({ description: 'Destination warehouse ID' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
