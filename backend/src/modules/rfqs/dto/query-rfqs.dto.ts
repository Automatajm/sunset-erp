import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const RFQ_STATUSES = [
  'draft',
  'sent',
  'partial_response',
  'fully_responded',
  'awarded',
  'cancelled',
] as const;

export class QueryRfqsDto {
  @ApiPropertyOptional({ enum: RFQ_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(RFQ_STATUSES as unknown as string[])
  status?: string;
}
