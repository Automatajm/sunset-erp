// ============================================================================
// FILE: backend/src/modules/ar-invoices/dto/query-ar-invoices.dto.ts
// spec-026 — query whitelists
// ============================================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class QueryArInvoicesDto {
  @ApiPropertyOptional({ enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'] })
  @IsOptional()
  @IsIn(['draft', 'sent', 'partial', 'paid', 'overdue', 'void'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by customer UUID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Invoice date from' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Invoice date to' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
