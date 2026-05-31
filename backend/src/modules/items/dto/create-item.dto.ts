// ============================================================================
// FILE: backend/src/modules/items/dto/create-item.dto.ts
// ============================================================================
import { IsString, IsOptional, IsBoolean, IsNumber, IsUUID, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  // ── Identity ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: 'ITEM001',
    description: 'Item code — auto-generated if omitted (ITEM-0001, ITEM-0002, …)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ example: 'Steel Bolt M8x50', description: 'Item name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'High-grade steel bolt' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'raw_material',
    description: 'raw_material | finished_good | work_in_progress | service',
  })
  @IsString()
  @MaxLength(50)
  itemType: string;

  // ── Classification ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Category ID (from in_categories)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Consumption group ID (from in_consumption_groups)' })
  @IsOptional()
  @IsUUID()
  consumptionGroupId?: string;

  // ── Barcodes (Sprint 14F) ───────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: 'ITEM-0001',
    description:
      'Internal barcode — auto-generated from item code if omitted. Used for mobile count scanning.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcodeInternal?: string;

  @ApiPropertyOptional({
    example: '7501031311309',
    description:
      'External barcode — EAN-13, UPC, or supplier barcode. Accepted as alternative scan input.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcodeExternal?: string;

  // ── UOM — legacy (kept for backward compatibility) ──────────────────────────

  @ApiProperty({
    example: 'PCS',
    description: 'Base unit of measure (legacy field — use consumptionUomId for new items)',
  })
  @IsString()
  @MaxLength(20)
  baseUom: string;

  // ── UOM Triple ──────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Purchase UOM ID — unit used in POs and supplier quotes' })
  @IsOptional()
  @IsUUID()
  purchaseUomId?: string;

  @ApiPropertyOptional({
    example: 3.78541,
    description:
      'How many consumptionUom per 1 purchaseUom. Auto-calculated from catalog when possible.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchaseToConsumptionFactor?: number;

  @ApiPropertyOptional({
    description: 'Storage UOM ID — unit used for stock counting in warehouse',
  })
  @IsOptional()
  @IsUUID()
  storageUomId?: string;

  @ApiPropertyOptional({ example: 1, description: 'How many consumptionUom per 1 storageUom.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  storageToConsumptionFactor?: number;

  @ApiPropertyOptional({
    description: 'Consumption UOM ID — unit used in BOM and production orders',
  })
  @IsOptional()
  @IsUUID()
  consumptionUomId?: string;

  // ── Flags ───────────────────────────────────────────────────────────────────

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

  // ── Valuation ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'average', description: 'average | fifo | standard' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  valuationMethod?: string;

  @ApiPropertyOptional({ example: 10.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardCost?: number;

  // ── Planning ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  safetyStock?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderQuantity?: number;
}
