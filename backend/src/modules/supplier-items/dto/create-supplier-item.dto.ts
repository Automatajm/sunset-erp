// --- supplier-items/dto/create-supplier-item.dto.ts ---
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierItemDto {
  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ example: 'LOC-GAL-001', description: "Supplier's own code for this item" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierItemCode?: string;

  @ApiPropertyOptional({
    example: 'Loctite Adhesive 1 Gallon',
    description: "Supplier's item description",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierItemName?: string;

  @ApiProperty({ description: 'Purchase UOM ID (from cfg_uom_units)' })
  @IsUUID()
  purchaseUomId: string;

  @ApiPropertyOptional({ example: 1, description: 'Pack size in purchase UOM units', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  packSize?: number;

  @ApiPropertyOptional({
    example: 3.78541,
    description:
      'Conversion factor: how many consumptionUom per 1 purchaseUom. Auto-calculated from catalog if omitted.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  conversionFactor?: number;

  @ApiPropertyOptional({ example: 45.99, description: 'Last known price per purchase UOM' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lastPrice?: number;

  @ApiPropertyOptional({ example: 7, description: 'Lead time in days', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Minimum order quantity in purchase UOM',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  moq?: number;

  @ApiPropertyOptional({ default: false, description: 'Mark as preferred supplier for this item' })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
