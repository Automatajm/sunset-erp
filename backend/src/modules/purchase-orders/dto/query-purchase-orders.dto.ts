import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PO_STATUSES = [
  'draft',
  'confirmed',
  'partially_received',
  'received',
  'closed',
  'cancelled',
] as const;

export class QueryPurchaseOrdersDto {
  @ApiPropertyOptional({ enum: PO_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(PO_STATUSES as unknown as string[])
  status?: string;
}
