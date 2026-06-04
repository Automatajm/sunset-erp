import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBomComponentDto } from './create-bom-component.dto';

export class CreateBomDto {
  @ApiProperty({ description: 'Parent item UUID (finished good)' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ example: '1', description: 'BOM version (integer as string)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'version must be a positive integer string' })
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
