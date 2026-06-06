import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateProductionPlanDto } from './create-production-plan.dto';
import { IsOptional, IsNumber, IsString, Min, Max, IsDateString } from 'class-validator';

// Decimal(15,3) capacity cap — overflow fails 400, never 500.
const MAX_QTY = 999999999999;
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductionPlanDto extends PartialType(
  OmitType(CreateProductionPlanDto, ['lines'] as const),
) {}

export class UpdateProductionPlanLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(MAX_QTY)
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
  @Max(MAX_QTY)
  producedQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
