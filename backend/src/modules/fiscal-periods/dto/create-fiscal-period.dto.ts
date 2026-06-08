import { IsString, IsDateString, IsBoolean, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFiscalPeriodDto {
  @ApiProperty({ example: '2026-03', description: 'Period code (YYYY-MM)' })
  @IsString()
  @MaxLength(20)
  periodCode: string;

  @ApiProperty({ example: 'March 2026', description: 'Period name' })
  @IsString()
  @MaxLength(100)
  periodName: string;

  @ApiProperty({ example: '2026-03-01', description: 'Period start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31', description: 'Period end date' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: '2026', description: 'Fiscal year' })
  @IsString()
  @MaxLength(20)
  fiscalYear: string;

  @ApiPropertyOptional({ example: 'Q1', description: 'Fiscal quarter' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  fiscalQuarter?: string;

  @ApiPropertyOptional({ default: 'open', description: 'Period status: open, closed, locked' })
  @IsOptional()
  @IsIn(['open', 'closed', 'locked'])
  status?: string;

  @ApiPropertyOptional({ default: false, description: 'Is current period' })
  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;
}
