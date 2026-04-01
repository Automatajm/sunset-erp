// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/dto/approve-session.dto.ts
// ============================================================================
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional }  from '@nestjs/swagger';

export class ApproveSessionDto {
  @ApiPropertyOptional({ description: 'Approval notes for the audit trail' })
  @IsOptional()
  @IsString()
  approvalNotes?: string;
}