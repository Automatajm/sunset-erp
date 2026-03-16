import { PartialType } from '@nestjs/swagger';
import { CreateWorkCenterDto } from './create-work-center.dto';

export class UpdateWorkCenterDto extends PartialType(CreateWorkCenterDto) {}
