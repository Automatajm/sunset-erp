import {
  IsString, IsOptional, IsUUID, IsNumber, IsDateString,
  Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGeneralNeedLineDto {
  @ApiPropertyOptional({ description: 'Catalog item ID (null = generic not yet in catalog)' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Free-text description when item not in catalog' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  genericDescription?: string;

  @ApiProperty({ example: 100, description: 'Quantity needed' })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: 'KG', description: 'Unit of measure code' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ description: 'Date this quantity is needed by' })
  @IsDateString()
  requiredDate: string;

  @ApiPropertyOptional({ description: 'Suggested supplier ID (auto from SupplierItem.isPreferred)' })
  @IsOptional()
  @IsUUID()
  suggestedSupplierId?: string;

  @ApiPropertyOptional({ example: 12.50, description: 'Estimated unit cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedUnitCost?: number;

  @ApiPropertyOptional({ description: 'Source type: mo | manual' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sourceType?: string;

  @ApiPropertyOptional({ description: 'Production Order ID if exploded from MO' })
  @IsOptional()
  @IsUUID()
  sourceMoId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}