import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';

export class CreateBomRoutingDto {
  @ApiProperty({ example: 1, description: 'Step sequence number' })
  @IsNumber()
  @Min(1)
  stepNumber: number;

  @ApiProperty({ example: 'uuid-work-center-id' })
  @IsUUID()
  workCenterId: string;

  @ApiPropertyOptional({ example: 'Mix and shape beef patties' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0.5, description: 'Setup time in hours (fixed per MO)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  setupTime?: number;

  @ApiPropertyOptional({ example: 0.004, description: 'Run time per unit in hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  runTimePerUnit?: number;

  @ApiPropertyOptional({ example: 'Requires food-grade gloves' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBomRoutingDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  stepNumber?: number;

  @ApiPropertyOptional({ example: 'uuid-work-center-id' })
  @IsOptional()
  @IsUUID()
  workCenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  setupTime?: number;

  @ApiPropertyOptional({ example: 0.004 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  runTimePerUnit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}