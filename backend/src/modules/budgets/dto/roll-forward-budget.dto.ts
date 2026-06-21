import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RollForwardBudgetDto {
  @ApiProperty({ example: '2027', description: 'Fiscal year of the new (rolled-forward) budget' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  targetFiscalYear: string;

  @ApiProperty({
    example: 'BUDGET-2027',
    description: 'Code for the new budget (unique per tenant)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  targetBudgetCode: string;

  @ApiPropertyOptional({
    description: 'Name for the new budget. Default: "<source name> (FY<targetYear>)"',
    example: '2027 Annual Budget',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetBudgetName?: string;

  @ApiPropertyOptional({
    description: 'Growth/adjustment applied to every line amount, in percent. Default: 0.',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(1000)
  growthPercent?: number;

  @ApiPropertyOptional({
    description: 'Copy line notes onto the new lines. Default: true.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  includeNotes?: boolean;
}
