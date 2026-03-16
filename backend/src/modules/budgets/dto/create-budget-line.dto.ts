import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, MaxLength } from 'class-validator';

export class CreateBudgetLineDto {
  @ApiProperty({ example: 'uuid-of-account', description: 'Account UUID' })
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @ApiProperty({ example: '2026-01', description: 'Fiscal period (YYYY-MM)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  fiscalPeriod: string;

  @ApiProperty({ example: 50000, description: 'Budget amount' })
  @IsNumber()
  @IsNotEmpty()
  budgetAmount: number;

  @ApiProperty({ example: 'Salaries budget for January', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
