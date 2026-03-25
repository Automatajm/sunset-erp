import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const BULK_IMPORT_ENTITIES = [
  'items', 'customers', 'suppliers', 'warehouses', 'work-centers', 'accounts',
] as const;

export type BulkImportEntity = typeof BULK_IMPORT_ENTITIES[number];

export class BulkImportDto {
  @ApiPropertyOptional({ description: 'Array of records to import', isArray: true })
  @IsOptional()
  @IsArray()
  records?: Record<string, any>[];

  @ApiPropertyOptional({ description: 'External URL to fetch records from (JSON array)' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Bearer token for sourceUrl authentication' })
  @IsOptional()
  @IsString()
  sourceToken?: string;

  @ApiPropertyOptional({ description: 'If true, validate only — do not insert', default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export interface BulkImportError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface BulkImportResult {
  entity: string;
  total: number;
  valid: number;
  inserted: number;
  skipped: number;
  errors: BulkImportError[];
  dryRun: boolean;
}