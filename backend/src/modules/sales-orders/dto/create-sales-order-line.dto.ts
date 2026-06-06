import { IsString, IsUUID, IsNumber, IsOptional, Min, Max, MaxLength } from 'class-validator';

// Safe caps within the Decimal column capacities — overflow fails 400, never 500.
// orderedQuantity: Decimal(15,3) (< 1e12) | unitPrice: Decimal(15,4) (< 1e11).
const MAX_QTY = 999999999999;
const MAX_PRICE = 99999999999;
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
  @Max(MAX_QTY)
  orderedQuantity: number;

  @ApiProperty({ example: 'PCS', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: 99.99, description: 'Unit price' })
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  unitPrice: number;

  @ApiPropertyOptional({ example: 10, description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: '2026-04-20', description: 'Requested delivery date' })
  @IsOptional()
  @IsString()
  deliveryDate?: string;
}
