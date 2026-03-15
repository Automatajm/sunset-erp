import { IsString, IsUUID, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';
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
  orderedQuantity: number;

  @ApiProperty({ example: 'KG', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: 10.50, description: 'Unit price' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 5, description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ example: '2026-04-15', description: 'Expected delivery date' })
  @IsOptional()
  @IsString()
  expectedDate?: string;
}
