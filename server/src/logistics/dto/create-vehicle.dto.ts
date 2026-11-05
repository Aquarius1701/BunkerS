import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty({ description: 'Mashina / Texnika nomi', example: 'HOWO Samosval 25t' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ description: 'Texnika turi', example: 'samosval', enum: ['samosval', 'mikser', 'kran_manipulyator', 'gazel', 'fura'] })
  @IsString()
  @IsIn(['samosval', 'mikser', 'kran_manipulyator', 'gazel', 'fura'])
  type!: string;

  @ApiProperty({ description: 'Yuk ko‘tarish quvvati (tonna)', example: 25 })
  @IsNumber()
  capacityTons!: number;

  @ApiProperty({ description: '1 km uchun narx (so‘m)', example: 18000 })
  @IsNumber()
  pricePerKm!: number;

  @ApiProperty({ description: 'Boshlang‘ich minimal narx (so‘m)', example: 250000 })
  @IsNumber()
  basePrice!: number;

  @ApiPropertyOptional({ description: 'Mavjudlik holati', default: true })
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiProperty({ description: 'Haydovchi F.I.Sh.', example: 'Jamshid Rahimov' })
  @IsString()
  @IsNotEmpty()
  driverName!: string;

  @ApiProperty({ description: 'Haydovchi telefoni', example: '+998901112233' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ description: 'Hozirgi turgan joyi / hudud', example: 'Toshkent, Sergeli' })
  @IsString()
  @IsNotEmpty()
  currentLocation!: string;

  @ApiPropertyOptional({ description: 'Texnika rasmi URL' })
  @IsOptional()
  @IsString()
  image?: string;
}
