import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class LookupCompanyDto {
  @ApiProperty({
    description: 'Yuridik shaxsning 9 xonali STIR (INN) raqami',
    example: '201122334',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, {
    message: 'STIR faqat 9 ta raqamdan iborat bo‘lishi shart (masalan: 201122334)',
  })
  inn!: string;
}
