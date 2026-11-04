import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryDebtDto {
  @ApiPropertyOptional({ description: 'Do‘kon ID bo‘yicha filter', example: 'sup-123' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Qarz holati (pending - to‘lanmagan, paid - to‘liq to‘langan)',
    enum: ['pending', 'paid'],
    example: 'pending',
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'paid'], {
    message: 'status faqat "pending" yoki "paid" bo‘lishi mumkin',
  })
  status?: 'pending' | 'paid';

  @ApiPropertyOptional({ description: 'Mijoz ismi yoki telefon raqami bo‘yicha qidirish', example: 'Bahodir' })
  @IsOptional()
  @IsString()
  search?: string;
}
