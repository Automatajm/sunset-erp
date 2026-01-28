import { PartialType } from '@nestjs/swagger';
import { CreateStatusGroupDto } from './create-status-group.dto';

export class UpdateStatusGroupDto extends PartialType(CreateStatusGroupDto) {}
