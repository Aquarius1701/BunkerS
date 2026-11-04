import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDebtDto {
  @ApiProperty({ description: 'Do‘kon / Yetkazib beruvchi ID', example: 'sup-123' })
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiProperty({ description: 'Mijoz F.I.Sh.', example: 'Bahodir Qodirov' })
  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @ApiProperty({ description: 'Mijoz telefon raqami', example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  customerPhone!: string;

  @ApiPropertyOptional({
    description: 'Nasiyaga berilgan mahsulotlar (JSON yoki massiv)',
    example: [{ title: 'M500 Sement', quantity: 20, price: 78000 }],
  })
  @IsOptional()
  items?: any;

  @ApiProperty({ description: 'Umumiy buyurtma summasi (so‘m)', example: 1560000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalOrderAmount!: number;

  @ApiPropertyOptional({ description: 'Boshlang‘ich to‘langan summa (so‘m)', default: 0, example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialPaidAmount?: number;

  @ApiPropertyOptional({ description: 'Izoh / Eslatma', example: 'Oylik chiqqanda 15-sanada to‘laydi' })
  @IsOptional()
  @IsString()
  note?: string;
}
