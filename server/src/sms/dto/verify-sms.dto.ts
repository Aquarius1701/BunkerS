import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifySmsDto {
  @ApiProperty({
    example: '+998 90 123 45 67',
    description: 'Foydalanuvchi telefon raqami',
  })
  @IsString()
  phone!: string;

  @ApiProperty({
    example: '123456',
    description: 'SMS orqali yuborilgan 6 xonali tasdiqlash kodi',
  })
  @IsString()
  code!: string;

  @ApiPropertyOptional({
    example: 'migration',
    description: 'SMS maqsadi',
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    example: '+998 90 123 45 67',
    description: 'Hisobga biriktirilgan kutilayotgan telefon raqam',
  })
  @IsOptional()
  @IsString()
  expectedAccountPhone?: string;
}
