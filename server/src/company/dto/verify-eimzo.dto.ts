import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { EImzoCertificateDto } from './register-mchj.dto';

export class VerifyEImzoDto {
  @ApiProperty({ description: '9 xonali STIR (INN)', example: '201122334' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, { message: 'STIR aynan 9 ta raqam bo‘lishi kerak' })
  inn!: string;

  @ApiProperty({ description: 'Server challenge ID', example: 'ch_1a2b3c4d5e' })
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @ApiProperty({ description: 'E-IMZO raqamli imzosi', example: 'base64_signature...' })
  @IsString()
  @IsNotEmpty()
  signature!: string;

  @ApiPropertyOptional({ description: 'Sertifikat ma’lumotlari', type: EImzoCertificateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EImzoCertificateDto)
  certificate?: EImzoCertificateDto;
}
