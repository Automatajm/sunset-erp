import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateWarehouseLocationDto {
  @ApiProperty({ example: 'A-01-01', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Pasillo A - Rack 1 - Nivel 1', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  aisle?: string;

  @ApiPropertyOptional({ example: '01' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  rack?: string;

  @ApiPropertyOptional({ example: '01' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  shelf?: string;

  @ApiPropertyOptional({ example: '01' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  bin?: string;
}