import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EImzoCertificateDto {
  @ApiPropertyOptional({ example: '201122334' })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional({ example: '«BUNKER STROY INVEST» MChJ' })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional({ example: 'Karimov Jasur Bahromovich' })
  @IsOptional()
  @IsString()
  directorName?: string;
}

export class EImzoPayloadDto {
  @ApiProperty({ description: 'Serverdan olingan bir martalik Challenge ID', example: 'ch_1a2b3c4d5e' })
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ description: 'E-IMZO orqali hosil qilingan raqamli imzo (PKCS#7)', example: 'base64_signature...' })
  @IsString()
  @IsNotEmpty()
  signature!: string;

  @ApiPropertyOptional({ description: 'E-IMZO sertifikat ma’lumotlari', type: EImzoCertificateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EImzoCertificateDto)
  certificate?: EImzoCertificateDto;
}

export class RegisterMchjDto {
  @ApiProperty({ description: '9 xonali STIR (INN)', example: '201122334' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, { message: 'STIR aynan 9 ta raqamdan iborat bo‘lishi shart' })
  inn!: string;

  @ApiProperty({ description: 'Mas’ul shaxs telefon raqami (+998...)', example: '+998901234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ description: 'Tizimga kirish uchun login', example: 'bunker_invest' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Login kamida 5 ta belgidan iborat bo‘lishi kerak' })
  login!: string;

  @ApiProperty({ description: 'Parol', example: 'SecureP@ss123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(7, { message: 'Parol kamida 7 ta belgidan iborat bo‘lishi kerak' })
  password!: string;

  @ApiPropertyOptional({ description: 'Viloyat', example: 'Toshkent shahri' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Tuman', example: 'Yunusobod tumani' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Mahalla', example: 'Bog‘ishamol MFY' })
  @IsOptional()
  @IsString()
  mahalla?: string;

  @ApiPropertyOptional({ description: 'E-IMZO tasdiq ma’lumotlari', type: EImzoPayloadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EImzoPayloadDto)
  eimzo?: EImzoPayloadDto;
}
