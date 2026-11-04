import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryOrderDto {
  @ApiPropertyOptional({ description: 'Xaridor ID bo‘yicha filter', example: 'usr-123' })
  @IsOptional()
  @IsString()
  buyerId?: string;

  @ApiPropertyOptional({
    description: 'Buyurtma holati (pending, confirmed, assigned, in_transit, delivered, cancelled)',
    example: 'confirmed',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Yetkazib beruvchi ID bo‘yicha filter', example: 'sup-456' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Sahifa raqami', default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'Sahifadagi buyurtmalar soni', default: 30, example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
