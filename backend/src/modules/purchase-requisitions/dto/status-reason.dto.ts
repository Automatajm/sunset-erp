import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StatusReasonDto {
  @ApiPropertyOptional({ description: 'Reason for the transition (required when rejecting)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
