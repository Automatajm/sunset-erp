// ============================================================================
// FILE: backend/src/modules/goods-receipts/dto/create-grn-line.dto.ts
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsNumber, IsPositive, IsDateString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGrnLineDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'PO line UUID (links to PO line for 3-way match)' })
  @IsOptional()
  @IsUUID()
  poLineId?: string;

  @ApiProperty({ example: 'uuid', description: 'Item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 100.5, description: 'Received quantity' })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  receivedQuantity: number;

  @ApiProperty({ example: 'KG', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({ example: 3.50, description: 'Unit cost at receipt' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitCost?: number;

  @ApiPropertyOptional({ example: 'LOT-2026-001', description: 'Lot number for lot-tracked items' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Expiry date for perishable / expiry-tracked items' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 'Minor dents on packaging', description: 'Line notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}