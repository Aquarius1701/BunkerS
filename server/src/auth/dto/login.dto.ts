import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Foydalanuvchi telefoni (+998...), login yoki elektron pochtasi',
    example: '+998901234567',
  })
  @IsString({ message: 'Login qatori matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'Login yoki telefon raqami kiritilishi shart' })
  login!: string;

  @ApiProperty({
    description: 'Akkaunt paroli',
    example: 'SecurePass123!',
  })
  @IsString({ message: 'Parol matn bo‘lishi kerak' })
  @IsNotEmpty({ message: 'Parol kiritilishi shart' })
  @MinLength(4, { message: 'Parol kamida 4 ta belgidan iborat bo‘lishi kerak' })
  password!: string;
}
