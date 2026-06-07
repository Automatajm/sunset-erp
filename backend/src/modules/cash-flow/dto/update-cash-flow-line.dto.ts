import { PartialType } from '@nestjs/swagger';
import { CreateCashFlowLineDto } from './create-cash-flow-line.dto';

// spec-030 — bind a real validated DTO instead of Partial<CreateCashFlowLineDto>.
export class UpdateCashFlowLineDto extends PartialType(CreateCashFlowLineDto) {}
