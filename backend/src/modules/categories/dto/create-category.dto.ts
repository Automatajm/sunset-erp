// --- categories/dto/create-category.dto.ts ---
import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
export class CreateCategoryDto {
  @ApiProperty({ description: 'Parent macro category ID' })
  @IsUUID()
  macroCategoryId: string;
 
  @ApiProperty({ example: 'FG-FURNITURE', description: 'Unique category code' })
  @IsString()
  @MaxLength(50)
  code: string;
 
  @ApiProperty({ example: 'Finished Furniture', description: 'Category name' })
  @IsString()
  @MaxLength(255)
  name: string;
 
  @ApiPropertyOptional({ example: 'Finished goods ready for sale' })
  @IsOptional()
  @IsString()
  description?: string;
 
  @ApiPropertyOptional({ description: 'GL account ID for inventory (DR on receipt)' })
  @IsOptional()
  @IsUUID()
  inventoryAccountId?: string;
 
  @ApiPropertyOptional({ description: 'GL account ID for COGS (DR on shipment)' })
  @IsOptional()
  @IsUUID()
  cogsAccountId?: string;
 
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}