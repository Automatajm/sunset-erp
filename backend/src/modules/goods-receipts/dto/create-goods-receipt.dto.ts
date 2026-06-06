// ============================================================================
// FILE: backend/src/modules/goods-receipts/dto/create-goods-receipt.dto.ts
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsDateString,
  IsIn,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateGrnLineDto } from './create-grn-line.dto';

export class CreateGoodsReceiptDto {
  @ApiPropertyOptional({ example: 'uuid', description: 'PO UUID (optional)' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiPropertyOptional({
    example: 'uuid',
    description: 'Supplier UUID (required for manual GRNs without PO)',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ example: 'uuid', description: 'Warehouse UUID' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiPropertyOptional({
    example: 'complete',
    default: 'complete',
    enum: ['complete', 'partial', 'damaged', 'rejected'],
  })
  @IsOptional()
  @IsIn(['complete', 'partial', 'damaged', 'rejected'])
  condition?: string;

  @ApiPropertyOptional({ example: 'Delivered by truck' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: 'INV-2026-00123',
    description: 'Supplier invoice number for manual receipts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierRef?: string;

  @ApiProperty({ description: 'GRN lines (min 1)', type: [CreateGrnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateGrnLineDto)
  lines: CreateGrnLineDto[];
}
