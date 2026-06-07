import { PartialType } from '@nestjs/swagger';
import { CreateBudgetLineDto } from './create-budget-line.dto';

// spec-029 — bind a real validated DTO instead of Partial<CreateBudgetLineDto>.
export class UpdateBudgetLineDto extends PartialType(CreateBudgetLineDto) {}
