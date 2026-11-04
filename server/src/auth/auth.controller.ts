import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication & Security')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Foydalanuvchi yoki ta’minotchi tizimga kirishi (Login)',
    description:
      'Telefon raqam, login yoki elektron pochta hamda parol orqali tizimga kirish. Muvaffaqiyatli autentifikatsiyada 7 kunlik JWT Bearer token qaytariladi.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Muvaffaqiyatli autentifikatsiya qilindi',
  })
  @ApiResponse({
    status: 401,
    description: 'Login, telefon raqam yoki parol noto‘g‘ri',
  })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Yangi mijoz yoki yuridik shaxs ro‘yxatdan o‘tishi (Register)',
    description:
      'Telefon raqam, ism-sharif va parol orqali yangi profil ochish. Muvaffaqiyatli ro‘yxatdan o‘tishda avtomatik JWT token shakllanadi.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Foydalanuvchi muvaffaqiyatli ro‘yxatdan o‘tdi',
  })
  @ApiResponse({
    status: 400,
    description: 'Telefon raqam band yoki kiritilgan ma’lumotlar yaroqsiz',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Joriy autentifikatsiyadan o‘tgan profil ma’lumotlarini olish',
    description:
      'JWT Bearer token sarlavhasida yuborilgan foydalanuvchi yoki ta’minotchi obyektini xavfsiz holda qaytaradi.',
  })
  @ApiResponse({
    status: 200,
    description: 'Foydalanuvchi profili ma’lumotlari',
  })
  @ApiResponse({
    status: 401,
    description: 'Avtorizatsiyadan o‘tilmagan yoki token eskirgan',
  })
  async getProfile(@Request() req: any) {
    return {
      success: true,
      user: req.user,
    };
  }

  // =========================================================================
  // MIGRATION, SESSION & BACKWARDS COMPATIBILITY ROUTES
  // =========================================================================

  @Get('session')
  @ApiOperation({ summary: 'HttpOnly cookie orqali aktiv sessiyani tekshirish' })
  getSession(@Headers('cookie') cookieHeader?: string) {
    return this.authService.getSession(cookieHeader);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tizimdan chiqish va sessiya kuki-ni tozalash' })
  logout(
    @Headers('x-bunkerstroy-test-suite') testHeader: string | undefined,
    @Body() body: { resetTestRateLimits?: boolean } | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(
      res,
      testHeader === '1',
      Boolean(body?.resetTestRateLimits),
    );
  }

  @Post('hash-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Parolni Argon2id memory-hard spetsifikatsiyasi bilan xesh qilish' })
  hashPassword(@Body() body: { password?: string }) {
    return {
      success: true,
      hash: this.authService.hashPassword(String(body?.password || '')),
    };
  }

  @Post('verify-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Argon2id xeshini vaqt hujumlaridan xavfsiz tekshirish' })
  verifyPassword(@Body() body: { password?: string; passwordHash?: string }) {
    return {
      success: true,
      valid: this.authService.verifyPassword(
        String(body?.password || ''),
        String(body?.passwordHash || ''),
      ),
    };
  }

  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eski akkaunt paroli va migratsiya holatini tekshirish' })
  verifyAccount(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyAccount(body, res);
  }

  @Post('migration-backup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Migratsiyadan oldin shifrlangan snapshot zahirasini olish' })
  createMigrationBackup(@Body() body: any) {
    return this.authService.createMigrationBackup(body);
  }

  @Post('migration-rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Migratsiyani bekor qilish va hisobni tiklash' })
  rollbackMigration(@Body() body: any) {
    return this.authService.rollbackMigration(body);
  }

  @Get('migration-backups')
  @ApiOperation({ summary: 'Mavjud migratsiya zaxiralari ro‘yxatini olish' })
  getMigrationBackups() {
    return this.authService.getMigrationBackups();
  }

  @Post('complete-migration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Akkauntni yangi xavfsizlik tizimiga muvaffaqiyatli o‘tkazish' })
  completeMigration(
    @Body() body: any,
    @Headers('x-bunkerstroy-test-suite') testHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.completeMigration(body, res, testHeader === '1');
  }
}
