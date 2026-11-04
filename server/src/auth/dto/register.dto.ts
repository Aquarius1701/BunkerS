import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Foydalanuvchi telefon raqami (+998...)',
    example: '+998901234567',
  })
  @IsString({ message: 'Telefon raqam matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'Telefon raqami kiritilishi shart' })
  @Matches(/^\+?998\d{9}$/, {
    message: 'Telefon raqam formati noto‘g‘ri (masalan: +998901234567)',
  })
  phone!: string;

  @ApiProperty({
    description: 'Foydalanuvchi to‘liq ismi yoki korxona nomi',
    example: 'Jasur Karimov',
  })
  @IsString({ message: 'Ism-sharif matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'Ism-sharif kiritilishi shart' })
  displayName!: string;

  @ApiProperty({
    description: 'Akkaunt xavfsiz paroli',
    example: 'SecurePass123!',
  })
  @IsString({ message: 'Parol matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'Parol kiritilishi shart' })
  @MinLength(4, { message: 'Parol kamida 4 ta belgidan iborat bo‘lishi kerak' })
  password!: string;

  @ApiPropertyOptional({
    description: 'Foydalanuvchi roli (customer, contractor, specialist)',
    enum: ['customer', 'contractor', 'specialist'],
    example: 'customer',
    default: 'customer',
  })
  @IsOptional()
  @IsString({ message: 'Rol matn bo‘lishi kerak' })
  @IsIn(['customer', 'contractor', 'specialist'], {
    message: 'Ro‘yxatdan o‘tishda faqat "customer", "contractor" yoki "specialist" rollari ruxsat etilgan',
  })
  role?: string = 'customer';

  @ApiPropertyOptional({
    description: 'Foydalanuvchi yuridik maqomi: individual yoki legal',
    enum: ['individual', 'legal'],
    example: 'individual',
    default: 'individual',
  })
  @IsOptional()
  @IsString()
  @IsIn(['individual', 'legal'], {
    message: 'userType faqat "individual" yoki "legal" bo‘lishi mumkin',
  })
  userType?: string = 'individual';

  @ApiPropertyOptional({
    description: 'Yuridik shaxs korxona nomi (MChJ, YaTT, XK)',
    example: '«BUNKER STROY INVEST» MChJ',
  })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({
    description: 'Yuridik shaxs STIR (INN) raqami',
    example: '201122334',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, {
    message: 'STIR aynan 9 ta raqamdan iborat bo‘lishi shart',
  })
  inn?: string;
}
