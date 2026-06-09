// --- supplier-items/dto/update-price.dto.ts ---
import { IsNumber, IsOptional, IsString, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSupplierItemPriceDto {
  @ApiProperty({ example: 48.5, description: 'New price per purchase UOM' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ example: '2026-04-11', description: 'Price validity start date' })
  @IsDateString()
  validFrom: string;

  @ApiPropertyOptional({ example: '2026-10-11', description: 'Price expiry date' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({
    example: 'rfq',
    description: 'Source: rfq | manual | import | grn',
    default: 'manual',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  source?: string;

  @ApiPropertyOptional({ description: 'RFQ ID if source is rfq' })
  @IsOptional()
  @IsString()
  rfqId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
