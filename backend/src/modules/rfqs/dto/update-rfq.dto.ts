import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateRfqDto } from './create-rfq.dto';

// Exclude supplierIds and lines from partial update — managed via dedicated endpoints
export class UpdateRfqDto extends PartialType(
  OmitType(CreateRfqDto, ['supplierIds', 'lines'] as const),
) {}