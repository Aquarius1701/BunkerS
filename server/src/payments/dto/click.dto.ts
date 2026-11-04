import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ClickRequestDto {
  @ApiProperty({
    description: 'Click tizimidagi tranzaksiya identifikatori',
    example: 12345678,
  })
  @IsNotEmpty({ message: 'click_trans_id talab qilinadi' })
  click_trans_id!: number | string;

  @ApiProperty({
    description: 'Click tizimidagi servis identifikatori (service_id)',
    example: 1001,
  })
  @IsNotEmpty({ message: 'service_id talab qilinadi' })
  service_id!: number | string;

  @ApiPropertyOptional({
    description: 'Click to‘lov hujjati ID si',
    example: 87654321,
  })
  @IsOptional()
  click_paydoc_id?: number | string;

  @ApiProperty({
    description: 'BunkerStroy buyurtma identifikatori (merchant_trans_id)',
    example: 'd3b07384-d113-4a12-8e68-0523e198b965',
  })
  @IsString({ message: 'merchant_trans_id matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'merchant_trans_id talab qilinadi' })
  merchant_trans_id!: string;

  @ApiProperty({
    description: 'To‘lov summasi (so‘mda)',
    example: 1500000,
  })
  @IsNotEmpty({ message: 'amount talab qilinadi' })
  amount!: number | string;

  @ApiProperty({
    description: 'Amal turi: 0 (Prepare) yoki 1 (Complete)',
    example: 0,
  })
  @IsNotEmpty({ message: 'action talab qilinadi' })
  action!: number | string;

  @ApiProperty({
    description: 'Xatolik kodi (0 - muvaffaqiyatli)',
    example: 0,
  })
  @IsNotEmpty({ message: 'error talab qilinadi' })
  error!: number | string;

  @ApiProperty({
    description: 'Xatolik izohi',
    example: 'Success',
  })
  @IsString()
  @IsNotEmpty({ message: 'error_note talab qilinadi' })
  error_note!: string;

  @ApiPropertyOptional({
    description: 'So‘rov yuborilgan vaqt',
    example: '2026-11-04 12:00:00',
  })
  @IsOptional()
  @IsString()
  sign_time?: string;

  @ApiPropertyOptional({
    description: 'MD5 raqamli imzo',
    example: '9c56cc51b374c3ba189210d5b6d4bf57',
  })
  @IsOptional()
  @IsString()
  sign_string?: string;
}

export class ClickPrepareDto extends ClickRequestDto {}
export class ClickCompleteDto extends ClickRequestDto {}
