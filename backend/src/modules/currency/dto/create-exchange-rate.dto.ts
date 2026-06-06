// ============================================================================
// FILE: backend/src/modules/currency/dto/create-exchange-rate.dto.ts
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsPositive,
  IsDateString,
  IsIn,
  IsOptional,
  Length,
  Max,
} from 'class-validator';

export class CreateExchangeRateDto {
  @ApiProperty({ example: 'USD', description: 'ISO 4217 code (must exist in the catalog)' })
  @IsString()
  @Length(3, 3)
  fromCurrency: string;

  @ApiProperty({ example: 'DOP', description: 'ISO 4217 code (must exist in the catalog)' })
  @IsString()
  @Length(3, 3)
  toCurrency: string;

  @ApiProperty({ example: 59.5, description: 'Units of toCurrency per 1 fromCurrency' })
  @IsNumber()
  @IsPositive()
  @Max(99999999999) // Decimal(18,6) capacity − 1 order of magnitude
  rate: number;

  @ApiProperty({ example: '2026-06-01', description: 'Date the rate becomes effective' })
  @IsDateString()
  rateDate: string;

  @ApiPropertyOptional({ example: 'manual', enum: ['manual', 'api'], default: 'manual' })
  @IsOptional()
  @IsIn(['manual', 'api'])
  source?: string;
}

export class QueryExchangeRatesDto {
  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  from?: string;

  @ApiPropertyOptional({ example: 'DOP' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  to?: string;
}
