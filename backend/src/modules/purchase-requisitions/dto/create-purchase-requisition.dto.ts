import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsEnum,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePurchaseRequisitionLineDto } from './create-purchase-requisition-line.dto';

export class CreatePurchaseRequisitionDto {
  @ApiProperty({ example: 'Materiales Producción Abril 2026' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'PRODUCCION', description: 'Department or cost center' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  departmentId?: string;

  @ApiPropertyOptional({ enum: ['normal', 'urgent', 'critical'], default: 'normal' })
  @IsOptional()
  @IsEnum(['normal', 'urgent', 'critical'])
  priority?: string;

  @ApiProperty({ description: 'Overall required date' })
  @IsDateString()
  requiredDate: string;

  @ApiPropertyOptional({ description: 'Business justification' })
  @IsOptional()
  @IsString()
  justification?: string;

  @ApiPropertyOptional({
    enum: ['manual', 'mrp', 'production_plan', 'general_need'],
    default: 'manual',
  })
  @IsOptional()
  @IsEnum(['manual', 'mrp', 'production_plan', 'general_need'])
  source?: string;

  @ApiPropertyOptional({ description: 'Estimated total amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999999999999) // Decimal(15,2) capacity
  estimatedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseRequisitionLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequisitionLineDto)
  lines: CreatePurchaseRequisitionLineDto[];
}
