import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ description: 'Mahsulot nomi', example: 'Qizilqum M500 Sement' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Kategoriya', example: 'Sement va quruq qorishmalar' })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ description: 'Narx (so‘m)', example: 78000 })
  @Type(() => Number)
  @IsNumber()
  price!: number;

  @ApiPropertyOptional({ description: 'Asl narx (chegirmadan oldingi)', example: 85000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  originalPrice?: number;

  @ApiPropertyOptional({ description: 'Tannarx (ichki foydalanish uchun)', example: 65000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costPrice?: number;

  @ApiPropertyOptional({ description: 'O‘lchov birligi', default: 'dona', example: 'qop (50kg)' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Ombordagi qoldiq', default: 100, example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stock?: number;

  @ApiPropertyOptional({ description: 'Minimal buyurtma miqdori', default: 1, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minOrder?: number;

  @ApiProperty({ description: 'Asosiy rasm URL', example: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f' })
  @IsString()
  @IsNotEmpty()
  image!: string;

  @ApiPropertyOptional({ description: 'Qo‘shimcha rasmlar', type: [String], example: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ description: 'Tavsif', example: 'Yuqori sifatli M500 sement' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Ta’mirlash turi', default: 'universal', example: 'universal' })
  @IsOptional()
  @IsString()
  repairType?: string;

  @ApiPropertyOptional({ description: 'Mahsulot turi', default: 'material', example: 'material' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi ID', example: 'sup-12345' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi STIR/INN', example: '201122334' })
  @IsOptional()
  @IsString()
  supplierInn?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi nomi', example: 'Bunker Partner' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ description: 'Kabinet turi (manufacturer/partner)', example: 'partner' })
  @IsOptional()
  @IsString()
  supplierCabinetType?: string;

  @ApiPropertyOptional({ description: 'Energiya samaradorligi reytingi', default: 'Standart', example: 'A++' })
  @IsOptional()
  @IsString()
  energyEfficiencyRating?: string;

  @ApiPropertyOptional({ description: 'ESCO sertifikatiga egaligi', default: false, example: true })
  @IsOptional()
  @IsBoolean()
  isEscoCertified?: boolean;

  @ApiPropertyOptional({ description: 'Viloyat / Hudud', example: 'Toshkent shahri' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Tuman', example: 'Yunusobod tumani' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Yetkazib berish xizmati mavjudligi', default: true })
  @IsOptional()
  @IsBoolean()
  hasDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Bonus mavjudligi', default: false })
  @IsOptional()
  @IsBoolean()
  hasBonus?: boolean;

  @ApiPropertyOptional({ description: 'Bonus tavsifi' })
  @IsOptional()
  @IsString()
  bonusDescription?: string;

  @ApiPropertyOptional({ description: 'Bonus uchun minimal chegara summasi' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bonusThreshold?: number;

  @ApiPropertyOptional({ description: 'Bonus summasi' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bonusAmount?: number;
}
