import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindJournalEntriesQueryDto {
  @ApiPropertyOptional({ enum: ['draft', 'posted'], description: 'Filter by status' })
  @IsOptional()
  @IsIn(['draft', 'posted'])
  status?: string;
}
