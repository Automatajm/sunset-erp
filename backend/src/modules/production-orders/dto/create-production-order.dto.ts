import {
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// spec-024: workCenterId removed — no column, no consumer, was validated then dropped.
export class CreateProductionOrderDto {
  @ApiProperty({ description: 'BOM UUID' })
  @IsUUID()
  bomId: string;

  @ApiProperty({ example: 100, description: 'Quantity to produce' })
  @IsNumber()
  @Min(0.001)
  @Max(99999999999) // Decimal(15,3) capacity − 1 order of magnitude
  quantityOrdered: number;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'Planned start date' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2026-04-05', description: 'Planned end date' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @ApiPropertyOptional({
    example: 'high',
    enum: ['low', 'medium', 'high', 'urgent'],
    description: 'Priority',
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
