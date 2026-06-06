import { IsUUID, IsNumber, IsString, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Safe cap below Decimal(18,2) column capacity (~1e16) — amounts beyond this must
// fail validation (400), never reach the DB and overflow (500). 1e15 is exactly
// representable as a JS float; the true column max (9999999999999999.99) is not.
const MAX_AMOUNT = 1e15;

export class CreateJournalEntryLineDto {
  @ApiProperty({ description: 'Account UUID' })
  @IsUUID()
  accountId: string;

  @ApiProperty({ example: 1000.0, description: 'Debit amount' })
  @IsNumber()
  @Min(0)
  @Max(MAX_AMOUNT)
  debitAmount: number;

  @ApiProperty({ example: 0, description: 'Credit amount' })
  @IsNumber()
  @Min(0)
  @Max(MAX_AMOUNT)
  creditAmount: number;

  @ApiPropertyOptional({ description: 'Line description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
