import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const GN_STATUSES = ['draft', 'in_progress', 'completed', 'cancelled'] as const;

export class QueryGeneralNeedsDto {
  @ApiPropertyOptional({ enum: GN_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(GN_STATUSES as unknown as string[])
  status?: string;
}
