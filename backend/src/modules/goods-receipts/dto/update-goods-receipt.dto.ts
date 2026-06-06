// ============================================================================
// FILE: backend/src/modules/goods-receipts/dto/update-goods-receipt.dto.ts
// ============================================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateGoodsReceiptDto {
  @ApiPropertyOptional({
    example: 'complete',
    enum: ['complete', 'partial', 'damaged', 'rejected'],
  })
  @IsOptional()
  @IsIn(['complete', 'partial', 'damaged', 'rejected'])
  condition?: string;

  @ApiPropertyOptional({ example: 'Additional notes after inspection' })
  @IsOptional()
  @IsString()
  notes?: string;
}
