import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendSmsDto {
  @ApiProperty({
    example: '+998 90 123 45 67',
    description: 'Foydalanuvchi telefon raqami (+998 formatida)',
  })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({
    example: 'migration',
    description: 'SMS yuborish maqsadi (confirm, migration, auth)',
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    example: 'usr-12345',
    description: 'Foydalanuvchi IDsi',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    example: '+998 90 123 45 67',
    description: 'Hisobga biriktirilgan kutilayotgan telefon raqam',
  })
  @IsOptional()
  @IsString()
  expectedAccountPhone?: string;

  @ApiPropertyOptional({
    example: 300000,
    description: 'Test muhiti uchun TTL (ms)',
  })
  @IsOptional()
  testTtlMs?: number;
}
