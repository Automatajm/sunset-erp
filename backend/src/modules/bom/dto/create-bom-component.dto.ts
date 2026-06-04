import { IsUUID, IsNumber, IsOptional, IsString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBomComponentDto {
  @ApiProperty({
    description:
      'Consumption Group UUID — represents the generic material need (replaces specific item)',
  })
  @IsUUID()
  consumptionGroupId: string;

  @ApiProperty({
    example: 2.5,
    description: 'Quantity per parent unit — expressed in formulador UOM (free)',
  })
  @IsNumber()
  @Min(0.001)
  @Max(999999999) // Decimal(15,6) — DB overflow must be a 400, not a 500
  quantity: number;

  @ApiProperty({
    example: 'GAL',
    description: 'Formulador UOM — free, any unit the formulator uses (GAL, KG, PCS, etc.)',
  })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({
    description:
      'System UOM UUID — auto-filled from consumptionGroup.consumptionUomId. MRP converts formulador UOM → this unit.',
  })
  @IsOptional()
  @IsUUID()
  consumptionUomId?: string;

  @ApiPropertyOptional({ example: 5, description: 'Scrap percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  scrapPercent?: number;
}
