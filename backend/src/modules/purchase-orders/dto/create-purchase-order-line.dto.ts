import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseOrderLineDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ description: 'Line description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 100, description: 'Quantity ordered' })
  @IsNumber()
  @Min(0.001)
  @Max(999999999999) // Decimal(15,3) capacity
  orderedQuantity: number;

  @ApiProperty({ example: 'KG', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: 10.5, description: 'Unit price' })
  @IsNumber()
  @Min(0)
  @Max(99999999999) // Decimal(15,4) capacity
  unitPrice: number;

  @ApiPropertyOptional({ example: 5, description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: '2026-04-15', description: 'Expected delivery date' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;
}
