import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateJournalEntryDto } from './create-journal-entry.dto';

export class UpdateJournalEntryDto extends PartialType(
  OmitType(CreateJournalEntryDto, ['lines'] as const)
) {}
