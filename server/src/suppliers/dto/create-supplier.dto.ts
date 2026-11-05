import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ description: 'Tashkilot nomi', example: 'Bekobod Metallurgiya Kombinati AJ' })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiProperty({ description: 'STIR / INN (9 ta raqam)', example: '200112233' })
  @IsString()
  @Matches(/^\d{9}$/, { message: 'STIR aynan 9 ta raqamdan iborat bo‘lishi shart' })
  inn!: string;

  @ApiProperty({ description: 'Kabinet turi (manufacturer | partner)', example: 'manufacturer' })
  @IsString()
  @IsIn(['manufacturer', 'partner'])
  cabinetType!: 'manufacturer' | 'partner';

  @ApiProperty({ description: 'Asosiy aloqa telefoni', example: '+998901112233' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ description: 'Qo‘shimcha aloqa telefoni', example: '+998912223344' })
  @IsOptional()
  @IsString()
  secondaryPhone?: string;

  @ApiProperty({ description: 'Viloyat / Hudud', example: 'Toshkent viloyati' })
  @IsString()
  @IsNotEmpty()
  region!: string;

  @ApiPropertyOptional({ description: 'Tuman / Shahar', example: 'Bekobod shahar' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Faoliyat toifasi', example: 'Metallurgiya & Armatura' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Kabinet logini', example: 'bekobod_zavod' })
  @IsOptional()
  @IsString()
  login?: string;

  @ApiPropertyOptional({ description: 'Dastlabki parol', example: 'Zavod2026!' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Shartnoma raqami', example: 'BMK-2026-78' })
  @IsOptional()
  @IsString()
  contractNumber?: string;

  @ApiPropertyOptional({ description: 'Komissiya foizi (%)', example: 1.5 })
  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  @ApiPropertyOptional({ description: 'Komissiya asosi (total | profit)', example: 'total' })
  @IsOptional()
  @IsString()
  commissionBasis?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi holati', example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;
}
