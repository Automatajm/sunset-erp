import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSalesOrderDto } from './create-sales-order.dto';

export class UpdateSalesOrderDto extends PartialType(
  OmitType(CreateSalesOrderDto, ['lines'] as const),
) {}
