import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class CreateStatusGroupDto {
  @ApiProperty({ example: 'INV_CUSTOM', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Custom Status Group', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Custom status group for inventory' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'INVENTORY' })
  @IsString()
  @IsNotEmpty()
  module: string;

  @ApiProperty({ example: 'CUSTOM_ENTITY' })
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  allowCustomStatuses?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  requireWorkflow?: boolean;
}
