import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PR_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const PR_PRIORITIES = ['normal', 'urgent', 'critical'] as const;

export class QueryPurchaseRequisitionsDto {
  @ApiPropertyOptional({ enum: PR_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(PR_STATUSES as unknown as string[])
  status?: string;

  @ApiPropertyOptional({ enum: PR_PRIORITIES, description: 'Filter by priority' })
  @IsOptional()
  @IsIn(PR_PRIORITIES as unknown as string[])
  priority?: string;
}
