import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { LookupCompanyDto } from './dto/lookup-company.dto';
import { RegisterMchjDto } from './dto/register-mchj.dto';
import { VerifyEImzoDto } from './dto/verify-eimzo.dto';

@ApiTags('STIR & Soliq Registry')
@Controller('api/company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('test-stirs')
  @ApiOperation({ summary: 'Frontend va sinovlar uchun test STIR raqamlari ro‘yxati' })
  @ApiResponse({ status: 200, description: 'Test STIRlar ro‘yxati' })
  getTestStirs() {
    return this.companyService.getTestStirs();
  }

  @Get('lookup')
  @ApiOperation({ summary: 'STIR (INN) bo‘yicha Soliq reyestridan tashkilotni qidirish (GET)' })
  @ApiResponse({ status: 200, description: 'Tashkilot ma’lumotlari' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri STIR formati' })
  @ApiResponse({ status: 404, description: 'Tashkilot topilmadi' })
  async lookupGet(@Query() query: LookupCompanyDto) {
    return this.companyService.lookupByStir(query.inn);
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'STIR (INN) bo‘yicha Soliq reyestridan tashkilotni qidirish (POST)' })
  @ApiBody({ type: LookupCompanyDto })
  @ApiResponse({ status: 200, description: 'Tashkilot ma’lumotlari' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri STIR formati' })
  @ApiResponse({ status: 404, description: 'Tashkilot topilmadi' })
  async lookupPost(@Body() dto: LookupCompanyDto) {
    return this.companyService.lookupByStir(dto.inn);
  }

  @Post('register-mchj')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'MChJ / Korxona kabinetini STIR orqali ro‘yxatdan o‘tkazish va E-IMZO tekshiruvi' })
  @ApiBody({ type: RegisterMchjDto })
  @ApiResponse({ status: 201, description: 'MChJ kabineti muvaffaqiyatli faollashtirildi' })
  @ApiResponse({ status: 400, description: 'STIR formati yoki telefon noto‘g‘ri' })
  @ApiResponse({ status: 422, description: 'Tashkilot tugatilgan, to‘xtatilgan yoki E-IMZO rad etildi' })
  async registerMchj(@Body() dto: RegisterMchjDto) {
    return this.companyService.registerMchj(dto);
  }

  @Post('verify-eimzo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'E-IMZO raqamli elektron imzosini tekshirish' })
  @ApiBody({ type: VerifyEImzoDto })
  @ApiResponse({ status: 200, description: 'E-IMZO imzosi tasdiqlandi' })
  @ApiResponse({ status: 422, description: 'E-IMZO imzosi mos kelmadi yoki rad etildi' })
  async verifyEImzo(@Body() dto: VerifyEImzoDto) {
    return this.companyService.verifyEImzo(dto);
  }
}
