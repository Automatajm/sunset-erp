import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class QueryProductionOrdersDto {
  @ApiPropertyOptional({ enum: ['draft', 'released', 'in_progress', 'completed', 'cancelled'] })
  @IsOptional()
  @IsIn(['draft', 'released', 'in_progress', 'completed', 'cancelled'])
  status?: string;
}

export class QueryVariancesDto {
  @ApiPropertyOptional({ enum: ['open', 'je_posted', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'je_posted', 'closed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['merma', 'surplus', 'labor', 'material'] })
  @IsOptional()
  @IsIn(['merma', 'surplus', 'labor', 'material'])
  varianceType?: string;
}
