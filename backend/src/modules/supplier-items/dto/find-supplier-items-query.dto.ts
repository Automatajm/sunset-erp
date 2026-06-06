// --- supplier-items/dto/find-supplier-items-query.dto.ts ---
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindSupplierItemsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by item' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Filter by preferred flag' })
  @IsOptional()
  @IsIn(['true', 'false'])
  isPreferred?: string;
}
