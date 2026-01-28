import { PartialType } from '@nestjs/swagger';
import { CreateStatusTransitionDto } from './create-status-transition.dto';

export class UpdateStatusTransitionDto extends PartialType(CreateStatusTransitionDto) {}