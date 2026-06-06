import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExplodeMosDto {
  @ApiProperty({
    description: 'Production Order UUIDs to explode into this General Need (legacy path)',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  moIds: string[];
}
