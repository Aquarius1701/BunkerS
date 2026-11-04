import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QuerySupplierDto {
  @ApiPropertyOptional({
    description: 'Kabinet turi (manufacturer - zavod/ishlab chiqaruvchi, partner - diler/do‘kon)',
    enum: ['manufacturer', 'partner'],
    example: 'manufacturer',
  })
  @IsOptional()
  @IsString()
  @IsIn(['manufacturer', 'partner'], {
    message: 'cabinetType faqat "manufacturer" yoki "partner" bo‘lishi mumkin',
  })
  cabinetType?: string;

  @ApiPropertyOptional({ description: 'Hudud bo‘yicha filter', example: 'Toshkent' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Kategoriya bo‘yicha filter', example: 'Qurilish mollari' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Qidiruv so‘zi (kompaniya nomi, STIR/INN yoki viloyat)', example: 'sement' })
  @IsOptional()
  @IsString()
  search?: string;
}
