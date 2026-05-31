// --- macro-categories/dto/create-macro-category.dto.ts ---
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMacroCategoryDto {
  @ApiProperty({ example: 'WOOD', description: 'Unique macro category code' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Wood & Panels', description: 'Macro category name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Wood-based raw materials and finished goods' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
