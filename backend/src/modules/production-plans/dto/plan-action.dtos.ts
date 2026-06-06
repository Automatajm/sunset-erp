// ============================================================================
// Action + query DTOs for production-plans — spec-019.
// Replaces the inline @Body() types and free-string query params.
// ============================================================================
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export const PLAN_STATUSES = ['draft', 'confirmed', 'in_progress', 'completed', 'cancelled'];
export const PLAN_HORIZONS = ['weekly', 'monthly', 'quarterly'];

export class GenerateMosDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Plan line UUIDs to generate MOs for. Omit for all eligible lines.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lineIds?: string[];
}

export class LinkMoDto {
  @ApiProperty({ description: 'Production Order UUID to link to the plan line' })
  @IsUUID()
  moId: string;
}

export class FindPlansQueryDto {
  @ApiPropertyOptional({ enum: PLAN_HORIZONS })
  @IsOptional()
  @IsIn(PLAN_HORIZONS)
  horizon?: string;

  @ApiPropertyOptional({ enum: PLAN_STATUSES })
  @IsOptional()
  @IsIn(PLAN_STATUSES)
  status?: string;
}
