import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString, IsIn, Min, Max } from 'class-validator';

export class UpdateArInvoiceDto {
  @ApiPropertyOptional({ example: '2026-04-20' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Updated notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApplyPaymentDto {
  @ApiProperty({ example: '2026-03-21' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ example: 1500.0, description: 'Payment amount — can be partial' })
  @IsNumber()
  @Min(0.01)
  @Max(999999999999) // Decimal(15,2) capacity − 1 order of magnitude
  amount: number;

  @ApiPropertyOptional({
    example: 'transfer',
    enum: ['wire', 'ach', 'check', 'transfer', 'cash', 'card'],
  })
  @IsOptional()
  @IsIn(['wire', 'ach', 'check', 'transfer', 'cash', 'card'])
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'WIRE-2026-0312' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: 'Wire transfer received' })
  @IsOptional()
  @IsString()
  notes?: string;
}
