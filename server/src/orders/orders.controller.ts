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
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders & Escrow')
@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi buyurtma va 50/50 Eskrou to‘lovini rasmiylashtirish' })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({ status: 201, description: 'Buyurtma muvaffaqiyatli yaratildi va Eskrouga olindi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri ma’lumotlar kiritildi' })
  async create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Buyurtmalar ro‘yxatini olish va filtrlash' })
  @ApiResponse({ status: 200, description: 'Buyurtmalar ro‘yxati' })
  async findAll(@Query() query: QueryOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha buyurtma tafsilotlari va mahsulotlarini olish' })
  @ApiParam({ name: 'id', description: 'Buyurtma UUID', example: 'order-uuid-123' })
  @ApiResponse({ status: 200, description: 'Buyurtma topildi' })
  @ApiResponse({ status: 404, description: 'Buyurtma topilmadi' })
  async findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buyurtma holati va haydovchi ma’lumotlarini yangilash' })
  @ApiParam({ name: 'id', description: 'Buyurtma UUID', example: 'order-uuid-123' })
  @ApiBody({ type: UpdateOrderStatusDto })
  @ApiResponse({ status: 200, description: 'Buyurtma holati muvaffaqiyatli yangilandi' })
  @ApiResponse({ status: 404, description: 'Buyurtma topilmadi' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }
}
