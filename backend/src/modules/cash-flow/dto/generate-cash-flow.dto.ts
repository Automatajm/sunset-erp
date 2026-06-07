import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

// spec-030 — validated body for generate-from-data (was an inline @Body() type).
export class GenerateCashFlowDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Override projection start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Override projection end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Include AR invoices as inflows (default true)',
  })
  @IsOptional()
  @IsBoolean()
  includeAR?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Include purchase orders as outflows (default true)',
  })
  @IsOptional()
  @IsBoolean()
  includePO?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Include budget lines as outflows (default true)',
  })
  @IsOptional()
  @IsBoolean()
  includeBudget?: boolean;
}
