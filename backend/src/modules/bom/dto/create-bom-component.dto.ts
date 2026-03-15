import { IsUUID, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBomComponentDto {
  @ApiProperty({ description: 'Component item UUID' })
  @IsUUID()
  componentItemId: string;

  @ApiProperty({ example: 2, description: 'Quantity required per parent unit' })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: 'PCS', description: 'Unit of measure' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiPropertyOptional({ example: 5, description: 'Scrap percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  scrapPercent?: number;

  @ApiPropertyOptional({ description: 'Component notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
