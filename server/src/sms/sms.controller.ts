import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SmsService } from './sms.service';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';

@ApiTags('SMS & OTP Verification')
@Controller('api/sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Get('status')
  @ApiOperation({ summary: 'SMS gateway holatini tekshirish' })
  @ApiResponse({ status: 200, description: 'SMS xizmati holati' })
  getStatus() {
    return this.smsService.getStatus();
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telefon raqamiga OTP tasdiqlash kodini yuborish' })
  @ApiResponse({ status: 200, description: 'OTP yuborildi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri telefon raqami yoki format' })
  @ApiResponse({ status: 429, description: 'SMS so‘rash limiti oshib ketdi' })
  sendSms(
    @Body() dto: SendSmsDto,
    @Headers('x-bunkerstroy-test-suite') testHeader?: string,
  ) {
    const isTestSuite = testHeader === '1';
    return this.smsService.sendSms(dto, isTestSuite);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telefon raqamiga kelgan OTP kodni tekshirish' })
  @ApiResponse({ status: 200, description: 'SMS muvaffaqiyatli tasdiqlandi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri yoki muddati o‘tgan kod' })
  @ApiResponse({ status: 429, description: 'Xato urinishlar limiti oshib ketdi' })
  verifySms(
    @Body() dto: VerifySmsDto,
    @Headers('x-bunkerstroy-test-suite') testHeader?: string,
  ) {
    const isTestSuite = testHeader === '1';
    return this.smsService.verifySms(dto, isTestSuite);
  }
}
