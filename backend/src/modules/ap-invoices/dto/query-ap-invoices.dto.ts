// ============================================================================
// FILE: backend/src/modules/ap-invoices/dto/query-ap-invoices.dto.ts
// spec-025 — query whitelists + LinkGrn body DTO
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class QueryApInvoicesDto {
  @ApiPropertyOptional({ enum: ['draft', 'posted', 'partial', 'paid', 'void'] })
  @IsOptional()
  @IsIn(['draft', 'posted', 'partial', 'paid', 'void'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier UUID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Invoice date from' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Invoice date to' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class LinkGrnDto {
  @ApiProperty({ description: 'GRN UUID to link' })
  @IsUUID()
  grnId: string;
}
