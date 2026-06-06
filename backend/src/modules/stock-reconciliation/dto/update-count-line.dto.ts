// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/dto/update-count-line.dto.ts
// ============================================================================
import { IsUUID, IsNumber, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Safe cap within Decimal(15,3) column capacity — overflow fails with 400, never 500.
const MAX_QTY = 999999999999;

export class UpdateCountLineDto {
  @ApiProperty({ description: 'ID of the count line to update' })
  @IsUUID()
  lineId: string;

  @ApiPropertyOptional({
    description:
      'Counted qty in storageUom. System auto-converts to purchaseUom. Mutually exclusive with countedPurchaseQty.',
    example: 10.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_QTY)
  countedStorageQty?: number;

  @ApiPropertyOptional({
    description:
      'Counted qty in purchaseUom. System auto-converts to storageUom. Mutually exclusive with countedStorageQty.',
    example: 2.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_QTY)
  countedPurchaseQty?: number;

  @ApiPropertyOptional({ description: 'Optional notes for this line' })
  @IsOptional()
  @IsString()
  notes?: string;
}
