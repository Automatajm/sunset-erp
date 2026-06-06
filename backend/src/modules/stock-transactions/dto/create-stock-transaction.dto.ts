import {
  IsString,
  IsUUID,
  IsNumber,
  IsIn,
  IsOptional,
  IsDateString,
  IsPositive,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Manual endpoint moves stock as a receipt or an issue only — transfer and
// adjustment movement types belong to internal flows (GRN cancel, cycle count).
export const MANUAL_TRANSACTION_TYPES = ['receipt', 'issue'];

// Safe cap within Decimal(15,3) quantity / Decimal(15,4) cost column capacity.
const MAX_QUANTITY = 999999999999;
const MAX_UNIT_COST = 999999999999;

export class CreateStockTransactionDto {
  @ApiProperty({
    example: 'receipt',
    enum: MANUAL_TRANSACTION_TYPES,
    description: 'Transaction type: receipt | issue',
  })
  @IsString()
  @IsIn(MANUAL_TRANSACTION_TYPES)
  @MaxLength(50)
  transactionType: string;

  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Warehouse UUID' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({
    example: 100,
    description: 'Quantity, strictly positive — direction comes from transactionType',
  })
  @IsNumber()
  @IsPositive()
  @Max(MAX_QUANTITY)
  quantity: number;

  @ApiProperty({ example: 'PCS', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({
    example: 45.5,
    description: 'Unit cost in purchaseUom (used for WAC calculation on receipts)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_UNIT_COST)
  unitCost?: number;

  @ApiPropertyOptional({ description: 'Reference document ID (PO, SO, Production Order, etc.)' })
  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @ApiPropertyOptional({ example: 'purchase_order', description: 'Reference type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001', description: 'Lot number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lotNumber?: string;

  @ApiPropertyOptional({ example: 'SN-123456', description: 'Serial number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Transaction notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Transaction date (defaults to now)' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;
}
