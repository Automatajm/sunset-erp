import { PartialType } from '@nestjs/swagger';
import { CreateGeneralNeedDto } from './create-general-need.dto';

export class UpdateGeneralNeedDto extends PartialType(CreateGeneralNeedDto) {}