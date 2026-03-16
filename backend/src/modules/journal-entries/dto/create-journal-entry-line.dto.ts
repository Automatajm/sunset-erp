import { IsUUID, IsNumber, IsString, IsOptional, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJournalEntryLineDto {
  @ApiProperty({ description: 'Account UUID' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ example: 1000.00, description: 'Debit amount' })
  @IsNumber()
  @Min(0)
  debitAmount: number;

  @ApiProperty({ example: 0, description: 'Credit amount' })
  @IsNumber()
  @Min(0)
  creditAmount: number;

  @ApiPropertyOptional({ description: 'Line description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Reference document type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @ApiPropertyOptional({ description: 'Reference document ID' })
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}
