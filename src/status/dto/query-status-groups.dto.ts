import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryStatusGroupsDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'INVENTORY' })
  @IsString()
  @IsOptional()
  module?: string;

  @ApiPropertyOptional({ example: 'RECEIPT' })
  @IsString()
  @IsOptional()
  entityType?: string;
}
