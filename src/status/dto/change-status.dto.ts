import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ChangeStatusDto {
  @ApiProperty({ example: 'APPROVED' })
  @IsString()
  @IsNotEmpty()
  statusCode: string;

  @ApiPropertyOptional({ example: 'Aprobado por supervisor' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ example: 'Material verificado y conforme' })
  @IsString()
  @IsOptional()
  comments?: string;
}