import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsBoolean, IsOptional, IsNumber, Min, IsArray, MaxLength, IsUUID } from 'class-validator';
import { ItemType } from '@prisma/client';

export class CreateItemDto {
  @ApiProperty({ example: 'PROD-2026-00001', description: 'Unique item code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Laptop Dell XPS 15', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Professional laptop with high performance' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: ItemType, example: 'PRODUCT' })
  @IsEnum(ItemType)
  itemType: ItemType;

  @ApiProperty({ example: 'uuid', description: 'Category ID' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'uuid', description: 'Base unit of measure ID' })
  @IsUUID()
  @IsNotEmpty()
  baseUnitId: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  isSellable?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  isInventoriable?: boolean;

  @ApiPropertyOptional({ example: 1200.50, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({ example: 1500.00, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({ example: 18.00, description: 'Tax rate percentage' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  taxRate?: number;

  @ApiPropertyOptional({ example: 100, description: 'Current stock in base unit' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  currentStock?: number;

  @ApiPropertyOptional({ example: 10, description: 'Minimum stock level' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional({ example: 500, description: 'Maximum stock level' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  maxStock?: number;

  @ApiPropertyOptional({ example: 20, description: 'Reorder point' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 'Dell', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @ApiPropertyOptional({ example: 'XPS 15 9520', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ example: 'DELL-XPS15-001', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ example: '7501234567890', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ example: ['electronics', 'laptop', 'premium'] })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}