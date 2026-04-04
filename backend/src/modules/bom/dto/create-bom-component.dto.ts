import { IsUUID, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBomComponentDto {
  @ApiProperty({ description: 'Component item UUID' })
  @IsUUID()
  componentItemId: string;

  @ApiProperty({ example: 2, description: 'Quantity required per parent unit (in formulador UOM)' })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: 'GAL', description: 'Formulador UOM — free, any unit the formulator uses' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({
    description: 'System UOM UUID for MRP aggregation — must be a configured tenant system UOM (= item.consumptionUomId)',
  })
  @IsOptional()
  @IsUUID()
  consumptionUomId?: string;

  @ApiPropertyOptional({ example: 5, description: 'Scrap percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  scrapPercent?: number;

  @ApiPropertyOptional({ description: 'Component notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}