import { IsString, IsUUID, IsNumber, IsOptional, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStockTransactionDto {
  @ApiProperty({ example: 'receipt', description: 'Transaction type: receipt, issue, transfer, adjustment' })
  @IsString()
  @MaxLength(50)
  transactionType: string;

  @ApiProperty({ description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'Warehouse UUID' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: 100, description: 'Quantity (positive for IN, negative for OUT)' })
  @IsNumber()
  quantity: number;

  @ApiProperty({ example: 'PCS', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({ example: 45.50, description: 'Unit cost in purchaseUom (used for WAC calculation on receipts)' })
  @IsOptional()
  @IsNumber()
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