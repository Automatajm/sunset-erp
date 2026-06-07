import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUUID,
  IsIn,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateCashFlowLineDto {
  @ApiProperty({ example: '2026-01-15', description: 'Line date' })
  @IsDateString()
  @IsNotEmpty()
  lineDate: string;

  @ApiProperty({ example: 'inflow', description: 'Line type: inflow or outflow' })
  @IsIn(['inflow', 'outflow'])
  lineType: string;

  @ApiProperty({ example: 'Sales Revenue', description: 'Category' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiProperty({ example: 50000, description: 'Amount' })
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(999999999999999) // Decimal(18,2) capacity − 1 order of magnitude
  amount: number;

  @ApiProperty({ example: 'Projected sales collection', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'uuid-of-account', required: false })
  @IsUUID()
  @IsOptional()
  accountId?: string;
}
