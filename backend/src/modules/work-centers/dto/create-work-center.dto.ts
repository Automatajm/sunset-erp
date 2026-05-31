import { IsString, IsOptional, IsNumber, IsBoolean, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkCenterDto {
  @ApiProperty({ example: 'WC-001', description: 'Work center code' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Assembly Line 1', description: 'Work center name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'machine',
    description: 'Type: machine, labor, assembly, quality',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  workCenterType?: string;

  @ApiPropertyOptional({ example: 100, description: 'Capacity per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  capacityPerHour?: number;

  @ApiPropertyOptional({ example: 95, description: 'Efficiency percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  efficiencyPercent?: number;

  @ApiPropertyOptional({ example: 50, description: 'Cost per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPerHour?: number;

  @ApiPropertyOptional({ default: true, description: 'Is work center active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
