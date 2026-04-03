// ============================================================================
// FILE: backend/src/modules/goods-receipts/dto/create-goods-receipt.dto.ts
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGrnLineDto } from './create-grn-line.dto';

export class CreateGoodsReceiptDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'PO UUID (optional — GRN can exist without PO)' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiProperty({ example: 'uuid', description: 'Warehouse UUID where goods are received' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'Received date (defaults to today)' })
  @IsOptional()
  @IsString()
  receivedDate?: string;

  @ApiPropertyOptional({
    example: 'complete',
    description: 'Receipt condition: complete | partial | damaged | rejected',
    default: 'complete',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  condition?: string;

  @ApiPropertyOptional({ example: 'Delivered by truck, all items OK' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'INV-2026-00123', description: 'Supplier invoice / reference number for manual receipts' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierRef?: string;

  @ApiProperty({ description: 'GRN lines', type: [CreateGrnLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGrnLineDto)
  lines: CreateGrnLineDto[];
}