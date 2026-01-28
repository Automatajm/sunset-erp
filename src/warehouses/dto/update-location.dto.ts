import { PartialType } from '@nestjs/swagger';
import { CreateWarehouseLocationDto } from './create-location.dto';

export class UpdateWarehouseLocationDto extends PartialType(CreateWarehouseLocationDto) {}