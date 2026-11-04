import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { defaultEImzoService } from '../../services/eimzo/EImzoService';
import { CompanyService } from './company.service';
import { VerifyEImzoDto } from './dto/verify-eimzo.dto';

@ApiTags('E-IMZO Raqamli Imzo')
@Controller('api/eimzo')
export class EImzoController {
  constructor(private readonly companyService: CompanyService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E-IMZO bilan imzolash uchun bir martalik challenge yaratish' })
  @ApiResponse({ status: 200, description: 'Challenge yaratildi' })
  createChallenge(@Body() body: { inn?: string }) {
    const inn = body?.inn ? String(body.inn).trim() : undefined;
    const challenge = defaultEImzoService.createChallenge(inn);
    const expiresInSeconds = Math.max(
      0,
      Math.round((challenge.expiresAt - Date.now()) / 1000),
    );

    return {
      success: true,
      challengeId: challenge.challengeId,
      challengeText: challenge.challengeText,
      createdAt: new Date(challenge.createdAt).toISOString(),
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      expiresInSeconds,
      ttlMinutes: 5,
      message:
        'Bir martalik challenge muvaffaqiyatli yaratildi. Amal qilish muddati: 5 daqiqa.',
    };
  }

  @Get('challenge/:id')
  @ApiOperation({ summary: 'Challenge holatini va amal qilish muddatini tekshirish' })
  @ApiResponse({ status: 200, description: 'Challenge holati' })
  @ApiResponse({ status: 404, description: 'Challenge topilmadi' })
  getChallenge(@Param('id') id: string) {
    const challenge = defaultEImzoService.getChallenge(id);
    if (!challenge) {
      throw new NotFoundException({
        success: false,
        error: 'Challenge topilmadi.',
      });
    }

    const now = Date.now();
    const isExpired = now > challenge.expiresAt;
    const remainingSeconds = isExpired
      ? 0
      : Math.round((challenge.expiresAt - now) / 1000);

    return {
      success: true,
      challengeId: challenge.challengeId,
      challengeText: challenge.challengeText,
      isConsumed: challenge.isConsumed,
      isExpired,
      remainingSeconds,
      createdAt: new Date(challenge.createdAt).toISOString(),
      expiresAt: new Date(challenge.expiresAt).toISOString(),
    };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E-IMZO imzosini tekshirish' })
  @ApiResponse({ status: 200, description: 'E-IMZO muvaffaqiyatli tasdiqlandi' })
  @ApiResponse({ status: 422, description: 'E-IMZO imzosi mos kelmadi yoki rad etildi' })
  verifySignature(@Body() dto: VerifyEImzoDto) {
    return this.companyService.verifyEImzo(dto);
  }
}
