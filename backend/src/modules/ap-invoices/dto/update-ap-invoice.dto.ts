import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsIn, Min, Max } from 'class-validator';

export class UpdateApInvoiceDto {
  @ApiPropertyOptional({ example: '2026-04-20' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'SUP-INV-2026-0042' })
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyApPaymentDto {
  @ApiProperty({ example: '2026-03-21' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ example: 1500.0 })
  @IsNumber()
  @Min(0.01)
  @Max(999999999999) // Decimal(15,2) capacity − 1 order of magnitude
  amount: number;

  @ApiPropertyOptional({ example: 'wire', enum: ['wire', 'ach', 'check', 'transfer', 'cash'] })
  @IsOptional()
  @IsIn(['wire', 'ach', 'check', 'transfer', 'cash'])
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'WIRE-2026-0312' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
