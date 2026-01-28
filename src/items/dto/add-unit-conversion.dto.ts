import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsEnum, IsNumber, Min, IsOptional, IsBoolean, IsString, MaxLength } from 'class-validator';
import { UnitPurpose } from '@prisma/client';

export class AddUnitConversionDto {
  @ApiProperty({ enum: UnitPurpose, example: 'PURCHASE' })
  @IsEnum(UnitPurpose)
  purpose: UnitPurpose;

  @ApiProperty({ example: 'uuid', description: 'Unit of measure ID' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 50.0, description: 'Conversion factor to base unit' })
  @IsNumber()
  @Min(0.00000001)
  factor: number;

  @ApiPropertyOptional({ example: 8.50, description: 'Price in this unit' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'BAG-50KG' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  code?: string;

  @ApiPropertyOptional({ example: '7501234567890' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}