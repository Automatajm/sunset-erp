import { IsUUID, IsNumber, IsOptional, IsDateString, Min, MaxLength, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductionOrderDto {
  @ApiProperty({ description: 'BOM UUID' })
  @IsUUID()
  bomId: string;

  @ApiPropertyOptional({ description: 'Work Center UUID' })
  @IsOptional()
  @IsUUID()
  workCenterId?: string;

  @ApiProperty({ example: 100, description: 'Quantity to produce' })
  @IsNumber()
  @Min(0.001)
  quantityOrdered: number;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'Planned start date' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ example: '2026-04-05', description: 'Planned end date' })
  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @ApiPropertyOptional({ example: 'high', description: 'Priority: low, medium, high, urgent' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
