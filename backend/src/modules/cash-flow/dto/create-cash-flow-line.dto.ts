import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateCashFlowLineDto {
  @ApiProperty({ example: '2026-01-15', description: 'Line date' })
  @IsDateString()
  @IsNotEmpty()
  lineDate: string;

  @ApiProperty({ example: 'inflow', description: 'Line type: inflow or outflow' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lineType: string;

  @ApiProperty({ example: 'Sales Revenue', description: 'Category' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiProperty({ example: 50000, description: 'Amount' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'Projected sales collection', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'uuid-of-account', required: false })
  @IsString()
  @IsOptional()
  accountId?: string;
}
