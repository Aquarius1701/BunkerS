import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CrmService } from './crm.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { PayDebtDto } from './dto/pay-debt.dto';
import { QueryDebtDto } from './dto/query-debt.dto';

@ApiTags('CRM POS & Nasiya Daftari')
@Controller('api/crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('debts')
  @ApiOperation({ summary: 'Nasiya daftari bo‘yicha qarz yozuvlarini olish va filtrlash' })
  @ApiResponse({ status: 200, description: 'Qarz yozuvlari ro‘yxati' })
  async getDebts(@Query() query: QueryDebtDto) {
    return this.crmService.getDebts(query);
  }

  @Post('debts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Nasiya daftariga yangi qarz yozuvini kiritish' })
  @ApiBody({ type: CreateDebtDto })
  @ApiResponse({ status: 201, description: 'Yangi nasiya yozuvi muvaffaqiyatli saqlandi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri ma’lumotlar kiritildi' })
  @ApiResponse({ status: 404, description: 'Do‘kon topilmadi' })
  async createDebt(@Body() dto: CreateDebtDto) {
    return this.crmService.createDebt(dto);
  }

  @Patch('debts/:id/pay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Nasiya qarzini to‘lash yoki qisman to‘lovni qayd etish' })
  @ApiParam({ name: 'id', description: 'Nasiya yozuvi UUID', example: 'debt-123' })
  @ApiBody({ type: PayDebtDto })
  @ApiResponse({ status: 200, description: 'To‘lov muvaffaqiyatli qayd etildi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri to‘lov summasi' })
  @ApiResponse({ status: 404, description: 'Nasiya yozuvi topilmadi' })
  async recordPayment(
    @Param('id') id: string,
    @Body() dto: PayDebtDto,
  ) {
    return this.crmService.recordPayment(id, dto);
  }
}
