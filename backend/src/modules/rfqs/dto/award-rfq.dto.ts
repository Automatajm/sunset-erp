import {
  IsUUID, IsOptional, IsNumber, IsArray,
  ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AwardLineDto {
  @ApiProperty({ description: 'RFQ Line ID to award' })
  @IsUUID()
  rfqLineId: string;

  @ApiProperty({ description: 'RFQ Response Line ID that wins' })
  @IsUUID()
  rfqResponseLineId: string;

  @ApiPropertyOptional({ description: 'Partial award quantity (null = full offered qty)' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  awardedQty?: number;
}

export class AwardRfqDto {
  @ApiProperty({
    type: [AwardLineDto],
    description: 'Award per line — can mix suppliers (Option C)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AwardLineDto)
  awards: AwardLineDto[];

  @ApiPropertyOptional({ description: 'Warehouse ID for delivery (used in generated POs)' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}