import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateBudgetDto {
  @ApiProperty({ example: 'BUDGET-2026', description: 'Budget code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  budgetCode: string;

  @ApiProperty({ example: '2026 Annual Budget', description: 'Budget name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  budgetName: string;

  @ApiProperty({ example: '2026', description: 'Fiscal year' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  fiscalYear: string;

  @ApiProperty({ example: 'Annual operating budget for fiscal year 2026', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
