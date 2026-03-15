import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ example: 'ITEM001', description: 'Item code' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Steel Bolt M8x50', description: 'Item name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'High-grade steel bolt', description: 'Item description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'raw_material', description: 'Item type: raw_material, finished_good, work_in_progress, service' })
  @IsString()
  @MaxLength(50)
  itemType: string;

  @ApiProperty({ example: 'PCS', description: 'Base unit of measure' })
  @IsString()
  @MaxLength(20)
  baseUom: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isStockable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isSaleable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isManufacturable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLotTracked?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSerialTracked?: boolean;

  @ApiPropertyOptional({ example: 'average', description: 'Valuation method: average, fifo, standard' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  valuationMethod?: string;

  @ApiPropertyOptional({ example: 10.50, description: 'Standard cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardCost?: number;

  @ApiPropertyOptional({ example: 7, description: 'Lead time in days' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 100, description: 'Safety stock quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  safetyStock?: number;

  @ApiPropertyOptional({ example: 50, description: 'Reorder point' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 200, description: 'Reorder quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderQuantity?: number;
}
