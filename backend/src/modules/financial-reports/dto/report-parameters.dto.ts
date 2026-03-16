import { IsOptional, IsDateString, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportParametersDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Report start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Report end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: '2026-03', description: 'Fiscal period (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fiscalPeriod?: string;

  @ApiPropertyOptional({ example: 'asset', description: 'Filter by account type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountType?: string;

  @ApiPropertyOptional({ example: '1000', description: 'Specific account number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;
}
