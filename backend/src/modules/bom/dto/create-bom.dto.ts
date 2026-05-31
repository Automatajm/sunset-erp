import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBomComponentDto } from './create-bom-component.dto';

export class CreateBomDto {
  @ApiProperty({ description: 'Parent item UUID (finished good)' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ example: 'BOM-001', description: 'BOM code' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bomCode?: string;

  @ApiPropertyOptional({ example: 'Standard Assembly', description: 'BOM description' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ example: '1.0', description: 'BOM version' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @ApiPropertyOptional({ default: true, description: 'Is this the active BOM' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ description: 'List of components', type: [CreateBomComponentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBomComponentDto)
  components: CreateBomComponentDto[];
}
