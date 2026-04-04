import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePurchaseRequisitionDto } from './create-purchase-requisition.dto';

export class UpdatePurchaseRequisitionDto extends PartialType(
  OmitType(CreatePurchaseRequisitionDto, ['lines'] as const),
) {}
