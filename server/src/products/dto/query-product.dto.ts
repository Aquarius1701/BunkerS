import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryProductDto {
  @ApiPropertyOptional({ description: 'Kategoriya bo‘yicha filter', example: 'Sement va quruq qorishmalar' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Qidiruv so‘zi (nomi, tavsifi yoki yetkazib beruvchi)', example: 'sement' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi ID bo‘yicha filter', example: 'sup-123' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Hudud bo‘yicha filter', example: 'Toshkent' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Minimal narx', example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maksimal narx', example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Saralash mezoni (createdAt, price_asc, price_desc, popular)',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Saralash tartibi (asc | desc)', example: 'desc' })
  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Sahifa raqami', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Sahifadagi elementlar soni', default: 50, example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
