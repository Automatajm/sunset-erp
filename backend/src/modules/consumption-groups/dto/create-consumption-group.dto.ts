// --- consumption-groups/dto/create-consumption-group.dto.ts ---
import { IsString, IsOptional, IsBoolean, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
export class CreateConsumptionGroupDto {
  @ApiProperty({ example: 'ADH-INDUSTRIAL', description: 'Unique consumption group code' })
  @IsString()
  @MaxLength(50)
  code: string;
 
  @ApiProperty({ example: 'Industrial Adhesives', description: 'Group name' })
  @IsString()
  @MaxLength(255)
  name: string;
 
  @ApiPropertyOptional({ example: 'All adhesive materials expressed in LTR for production planning' })
  @IsOptional()
  @IsString()
  description?: string;
 
  @ApiProperty({ description: 'UOM ID that production uses — all items in group share this unit' })
  @IsUUID()
  consumptionUomId: string;
 
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}