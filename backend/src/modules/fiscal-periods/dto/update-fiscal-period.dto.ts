import { PartialType } from '@nestjs/swagger';
import { CreateFiscalPeriodDto } from './create-fiscal-period.dto';

export class UpdateFiscalPeriodDto extends PartialType(CreateFiscalPeriodDto) {}
