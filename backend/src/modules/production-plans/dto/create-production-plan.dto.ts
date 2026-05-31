import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsUUID,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductionPlanLineDto {
  @ApiProperty({ description: 'Item UUID (finished good)' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    description: 'BOM UUID — resolved automatically if item has one active BOM',
  })
  @IsOptional()
  @IsUUID()
  bomId?: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0.001)
  plannedQty: number;

  @ApiProperty({ example: 'PCS' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ example: '2026-04-07' })
  @IsDateString()
  plannedStart: string;

  @ApiProperty({ example: '2026-04-14' })
  @IsDateString()
  plannedEnd: string;

  @ApiPropertyOptional({ description: 'Source SO line UUID (when plan comes from sales orders)' })
  @IsOptional()
  @IsUUID()
  soLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProductionPlanDto {
  @ApiProperty({ example: 'Semana 15 – Producción Cajas' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: ['weekly', 'monthly', 'quarterly'] })
  @IsEnum(['weekly', 'monthly', 'quarterly'])
  horizon: string;

  @ApiPropertyOptional({ enum: ['free', 'from_sales_orders'], default: 'free' })
  @IsOptional()
  @IsEnum(['free', 'from_sales_orders'])
  source?: string;

  @ApiProperty({ example: '2026-04-07' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-04-13' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateProductionPlanLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductionPlanLineDto)
  lines: CreateProductionPlanLineDto[];
}
