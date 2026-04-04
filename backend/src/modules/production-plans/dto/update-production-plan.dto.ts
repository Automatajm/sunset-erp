import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateProductionPlanDto } from './create-production-plan.dto';
import { IsOptional, IsNumber, Min, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductionPlanDto extends PartialType(
  OmitType(CreateProductionPlanDto, ['lines'] as const),
) {}

export class UpdateProductionPlanLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  plannedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  producedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;
}
