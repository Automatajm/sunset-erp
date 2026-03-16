import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class CreateCashFlowProjectionDto {
  @ApiProperty({ example: 'CFP-2026-Q1', description: 'Projection code' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  projectionCode: string;

  @ApiProperty({ example: 'Q1 2026 Cash Flow Projection', description: 'Projection name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  projectionName: string;

  @ApiProperty({ example: '2026-01-01', description: 'Start date' })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2026-03-31', description: 'End date' })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({ example: 'realistic', description: 'Scenario: optimistic, realistic, pessimistic' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  scenario?: string;

  @ApiProperty({ example: 'Q1 cash flow projection for planning purposes', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
