import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsDateString, Min,
} from 'class-validator';

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

  @ApiProperty({ example: 1500.00 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'wire', enum: ['wire', 'ach', 'check', 'transfer', 'cash'] })
  @IsOptional()
  @IsString()
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