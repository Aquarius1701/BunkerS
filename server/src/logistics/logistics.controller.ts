import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import { CalculateFreightDto } from './dto/calculate-freight.dto';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
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

  @Post('vehicles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi og‘ir yuk transportini parkka qo‘shish' })
  @ApiBody({ type: CreateVehicleDto })
  @ApiResponse({ status: 201, description: 'Transport vositasi muvaffaqiyatli qo‘shildi' })
  async createVehicle(@Body() dto: CreateVehicleDto) {
    return this.logisticsService.createVehicle(dto);
  }

  @Put('vehicles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transport vositasi ma’lumotlarini tahrirlash' })
  @ApiParam({ name: 'id', description: 'Transport vositasi UUID' })
  @ApiBody({ type: UpdateVehicleDto })
  @ApiResponse({ status: 200, description: 'Ma’lumotlar yangilandi' })
  @ApiResponse({ status: 404, description: 'Transport vositasi topilmadi' })
  async updateVehicle(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.logisticsService.updateVehicle(id, dto);
  }

  @Delete('vehicles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transport vositasini parkdan o‘chirish' })
  @ApiParam({ name: 'id', description: 'Transport vositasi UUID' })
  @ApiResponse({ status: 200, description: 'Muvaffaqiyatli o‘chirildi' })
  @ApiResponse({ status: 404, description: 'Transport vositasi topilmadi' })
  async deleteVehicle(@Param('id') id: string) {
    return this.logisticsService.deleteVehicle(id);
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
