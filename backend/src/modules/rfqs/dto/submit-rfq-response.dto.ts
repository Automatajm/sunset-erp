import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  Min,
  MaxLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RfqResponseLineDto {
  @ApiProperty({ description: 'RFQ Line ID being responded to' })
  @IsUUID()
  rfqLineId: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0.001)
  offeredQty: number;

  @ApiProperty({ example: 'KG' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: 12.5, description: 'Unit price offered' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ example: 7, description: 'Lead time in days' })
  @IsNumber()
  @Min(0)
  leadTimeDays: number;

  @ApiPropertyOptional({ description: 'Price validity date' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ example: 1, description: 'Pack size offered' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  packSize?: number;

  @ApiPropertyOptional({ example: 10, description: 'Minimum order quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  moq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitRfqResponseDto {
  @ApiProperty({ description: 'RFQ Supplier record ID' })
  @IsUUID()
  rfqSupplierId: string;

  @ApiProperty({ type: [RfqResponseLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RfqResponseLineDto)
  lines: RfqResponseLineDto[];
}
