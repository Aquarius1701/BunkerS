import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ClickCompleteDto, ClickPrepareDto } from './dto/click.dto';
import { PaymeRpcDto } from './dto/payme.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments & Gateways')
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payme')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payme JSON-RPC 2.0 to‘lov vebhuki',
    description:
      'Payme Merchant API JSON-RPC 2.0 so‘rovlarini qayta ishlash: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction.',
  })
  @ApiBody({ type: PaymeRpcDto })
  @ApiResponse({
    status: 200,
    description: 'Payme JSON-RPC muvaffaqiyatli yoki xatolik javobi',
  })
  async payme(
    @Body() dto: PaymeRpcDto,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.paymentsService.handlePayme(dto, authHeader);
  }

  @Post('click/prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Click to‘lov shlyuzi Prepare bosqichi',
    description:
      'Click tizimidan kelgan to‘lov tayyorgarligi (Prepare) so‘rovini tekshirish: buyurtma mavjudligi, holati va to‘lov summasining aniqligini tasdiqlash.',
  })
  @ApiBody({ type: ClickPrepareDto })
  @ApiResponse({
    status: 200,
    description: 'Click Prepare tasdiq javobi (error: 0)',
  })
  async clickPrepare(@Body() dto: ClickPrepareDto) {
    return this.paymentsService.clickPrepare(dto);
  }

  @Post('click/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Click to‘lov shlyuzi Complete bosqichi',
    description:
      'Click to‘lovini yakunlash (Complete): buyurtmani paymentStatus="paid" holatiga o‘tkazish va paidAt sanasini belgilash.',
  })
  @ApiBody({ type: ClickCompleteDto })
  @ApiResponse({
    status: 200,
    description: 'Click Complete yakuniy tasdiq javobi (error: 0)',
  })
  async clickComplete(@Body() dto: ClickCompleteDto) {
    return this.paymentsService.clickComplete(dto);
  }
}
