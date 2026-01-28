import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { WarehouseType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryWarehousesDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'Almacén' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: WarehouseType })
  @IsEnum(WarehouseType)
  @IsOptional()
  warehouseType?: WarehouseType;

  @ApiPropertyOptional({ example: 'Santo Domingo' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}