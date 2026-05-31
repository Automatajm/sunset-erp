// ============================================================================
// FILE: backend/src/modules/goods-receipts/dto/update-goods-receipt.dto.ts
// ============================================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateGoodsReceiptDto {
  @ApiPropertyOptional({ example: 'complete' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  condition?: string;

  @ApiPropertyOptional({ example: 'Additional notes after inspection' })
  @IsOptional()
  @IsString()
  notes?: string;
}
