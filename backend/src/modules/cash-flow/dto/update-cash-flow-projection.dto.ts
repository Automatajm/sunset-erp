import { PartialType } from '@nestjs/swagger';
import { CreateCashFlowProjectionDto } from './create-cash-flow-projection.dto';

export class UpdateCashFlowProjectionDto extends PartialType(CreateCashFlowProjectionDto) {}
