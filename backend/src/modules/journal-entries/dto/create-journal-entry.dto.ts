import { IsString, IsDateString, IsArray, ValidateNested, IsOptional, MaxLength, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateJournalEntryLineDto } from './create-journal-entry-line.dto';

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-03-15', description: 'Entry date' })
  @IsDateString()
  entryDate: string;

  @ApiProperty({ example: 'general', description: 'Entry type: general, adjustment, closing, opening' })
  @IsString()
  @MaxLength(50)
  entryType: string;

  @ApiPropertyOptional({ description: 'Entry description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Reference document type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference document number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiProperty({ type: [CreateJournalEntryLineDto], description: 'Journal entry lines (minimum 2)' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryLineDto)
  lines: CreateJournalEntryLineDto[];
}
