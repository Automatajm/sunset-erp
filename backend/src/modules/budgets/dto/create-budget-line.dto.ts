import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class CreateBudgetLineDto {
  @ApiProperty({ example: 'uuid-of-account', description: 'Account UUID' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ example: '2026-01', description: 'Fiscal period (YYYY-MM)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  fiscalPeriod: string;

  @ApiProperty({ example: 50000, description: 'Budget amount' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(999999999999999) // Decimal(18,2) capacity − 1 order of magnitude
  budgetAmount: number;

  @ApiProperty({ example: 'Salaries budget for January', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
