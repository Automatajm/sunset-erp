// --- supplier-items/dto/update-supplier-item.dto.ts ---
import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSupplierItemDto } from './create-supplier-item.dto';
 
// supplierId and itemId cannot be changed after creation
export class UpdateSupplierItemDto extends PartialType(
  OmitType(CreateSupplierItemDto, ['supplierId', 'itemId'] as const),
) {}