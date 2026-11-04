import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class QueryVehicleDto {
  @ApiPropertyOptional({
    description: 'Transport turi (samosval, mikser, kran_manipulyator, gazel, fura)',
    example: 'samosval',
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({
    description: 'Faqat bo‘sh / band bo‘lmagan transportlar',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  available?: boolean;
}
