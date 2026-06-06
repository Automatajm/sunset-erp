// ============================================================================
// Query DTO for GET /sales-orders — spec-019.
// ============================================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export const SO_STATUSES = ['draft', 'confirmed', 'shipped', 'delivered', 'closed', 'cancelled'];

export class FindSalesOrdersQueryDto {
  @ApiPropertyOptional({ enum: SO_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(SO_STATUSES)
  status?: string;
}
