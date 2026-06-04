import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkCenterDto {
  @ApiProperty({ example: 'Assembly Line 1', description: 'Work center name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'machine',
    enum: ['machine', 'labor', 'assembly', 'quality'],
  })
  @IsOptional()
  @IsIn(['machine', 'labor', 'assembly', 'quality'])
  workCenterType?: string;

  @ApiPropertyOptional({ example: 100, description: 'Capacity per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99) // Decimal(10,2) — DB overflow must be a 400, not a 500
  capacityPerHour?: number;

  @ApiPropertyOptional({ example: 95, description: 'Efficiency percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999.99) // Decimal(5,2)
  efficiencyPercent?: number;

  @ApiPropertyOptional({ example: 50, description: 'Cost per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999999.99) // Decimal(10,2)
  costPerHour?: number;

  @ApiPropertyOptional({ default: true, description: 'Is work center active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
