import {
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
  IsOptional,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateJournalEntryLineDto } from './create-journal-entry-line.dto';

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-03-15' })
  @IsDateString()
  entryDate: string;

  @ApiProperty({ example: 'general', description: 'general | adjustment | closing | opening' })
  @IsString()
  @MaxLength(50)
  journalType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Reference document number' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiProperty({ type: [CreateJournalEntryLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateJournalEntryLineDto)
  lines: CreateJournalEntryLineDto[];
}
