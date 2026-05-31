import { PartialType } from '@nestjs/swagger';
import { CreateGeneralNeedLineDto } from './create-general-need-line.dto';

export class UpdateGeneralNeedLineDto extends PartialType(CreateGeneralNeedLineDto) {}
