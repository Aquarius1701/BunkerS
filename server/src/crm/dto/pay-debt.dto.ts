import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, Min } from 'class-validator';

export class PayDebtDto {
  @ApiProperty({ description: 'Qarz to‘lovi summasi (so‘m)', example: 300000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1, { message: 'To‘lov summasi kamida 1 so‘m bo‘lishi kerak' })
  @IsNotEmpty()
  amount!: number;
}
