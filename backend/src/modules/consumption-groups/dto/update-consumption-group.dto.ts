// --- consumption-groups/dto/update-consumption-group.dto.ts ---
import { PartialType } from '@nestjs/swagger';
import { CreateConsumptionGroupDto } from './create-consumption-group.dto';

export class UpdateConsumptionGroupDto extends PartialType(CreateConsumptionGroupDto) {}
