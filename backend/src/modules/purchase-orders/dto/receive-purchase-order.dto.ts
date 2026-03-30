// backend/src/modules/purchase-orders/dto/receive-purchase-order.dto.ts
 
import { IsArray, IsUUID, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
export class ReceiveLineDto {
  @ApiProperty({ description: 'PO Line ID' })
  @IsUUID()
  lineId: string;
 
  @ApiProperty({ description: 'Quantity received in this delivery' })
  @IsNumber()
  @Min(0)
  receivedQuantity: number;
 
  @ApiPropertyOptional({ description: 'Unit cost override (if different from PO price)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lotNumber?: string;
}
 
export class ReceivePurchaseOrderDto {
  @ApiProperty({ description: 'Warehouse ID to receive into' })
  @IsUUID()
  warehouseId: string;
 
  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
 
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}