// backend/src/modules/general-needs/dto/run-mrp.dto.ts
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunMrpDto {
  @ApiProperty({
    description: 'Production Order UUIDs to explode into this General Need',
    type: [String],
    example: ['uuid-mo-1', 'uuid-mo-2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  moIds: string[];
}
