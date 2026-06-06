// ============================================================================
// Query DTOs for the stock-transactions GET endpoints — spec-016.
// Free-string query params are whitelisted/typed so invalid input fails with
// 400 instead of silently mis-filtering.
// ============================================================================
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ITEM_TYPES = ['raw_material', 'finished_good', 'consumable'];
export const MOVEMENT_TYPES = ['receipt', 'issue', 'transfer', 'adjustment', 'opening_balance'];

export class FindMovementsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by item' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse (from OR to)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES, description: 'Filter by movement type' })
  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  transactionType?: string;
}

export class BalanceQueryDto {
  @ApiPropertyOptional({ description: 'Filter by item' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Filter by warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: ITEM_TYPES })
  @IsOptional()
  @IsIn(ITEM_TYPES)
  itemType?: string;
}

export class PlanningQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Only rows with alerts' })
  @IsOptional()
  @IsIn(['true', 'false'])
  alertOnly?: string;
}

export class TurnoverQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (default: Jan 1 current year)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (default: today)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class LedgerQueryDto extends TurnoverQueryDto {
  @ApiPropertyOptional({ description: 'Filter by item' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  movementType?: string;

  @ApiPropertyOptional({ description: 'Filter by document number (INV-2026-0001)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;
}
