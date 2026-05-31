// --- macro-categories/dto/update-macro-category.dto.ts ---
import { PartialType } from '@nestjs/swagger';
import { CreateMacroCategoryDto } from './create-macro-category.dto';

export class UpdateMacroCategoryDto extends PartialType(CreateMacroCategoryDto) {}
