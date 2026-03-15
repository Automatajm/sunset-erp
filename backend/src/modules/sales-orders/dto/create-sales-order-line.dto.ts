import { IsString, IsUUID, IsNumber, IsOptional, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesOrderLineDto {
  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ description: 'Line description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 50, description: 'Quantity ordered' })
  @IsNumber()
  @Min(0.001)
  orderedQuantity: number;

  @ApiProperty({ example: 'PCS', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: 99.99, description: 'Unit price' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 10, description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ example: '2026-04-20', description: 'Requested delivery date' })
  @IsOptional()
  @IsString()
  deliveryDate?: string;
}
