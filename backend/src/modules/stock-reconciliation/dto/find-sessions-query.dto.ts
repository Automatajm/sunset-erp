// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/dto/find-sessions-query.dto.ts
// ============================================================================
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const SESSION_STATUSES = [
  'draft',
  'in_progress',
  'pending_approval',
  'approved',
  'posted',
  'cancelled',
];

export class FindSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: SESSION_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(SESSION_STATUSES)
  status?: string;
}
