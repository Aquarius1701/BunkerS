import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalculateFreightDto {
  @ApiPropertyOptional({
    description: 'Yuk mashinasi turi (samosval, mikser, kran_manipulyator, gazel, fura)',
    default: 'samosval',
    example: 'samosval',
  })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({
    description: 'Yetkazish masofasi (km)',
    default: 10,
    example: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5, { message: 'Masofa kamida 0.5 km bo‘lishi lozim' })
  distanceKm?: number;

  @ApiPropertyOptional({
    description: 'Yuk umumiy og‘irligi (tonna)',
    default: 1,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1, { message: 'Yuk og‘irligi kamida 0.1 tonna bo‘lishi lozim' })
  totalWeightTons?: number;
}
