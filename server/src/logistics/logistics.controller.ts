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
import { CalculateFreightDto } from './dto/calculate-freight.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { LogisticsService } from './logistics.service';

@ApiTags('Heavy Logistics & Fleet')
@Controller('api/logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Og‘ir yuk mashinalari parkini olish va filtrlash' })
  @ApiResponse({ status: 200, description: 'Logistika transportlari ro‘yxati' })
  async getVehicles(@Query() query: QueryVehicleDto) {
    return this.logisticsService.getVehicles(query.type, query.available);
  }

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yetkazib berish narxini masofa va yuk tonnasiga qarab hisoblash' })
  @ApiBody({ type: CalculateFreightDto })
  @ApiResponse({ status: 200, description: 'Yuk yetkazish narxi va taxminiy vaqt hisoblandi' })
  async calculateFreight(@Body() dto: CalculateFreightDto) {
    return this.logisticsService.calculateFreight(dto);
  }
}
