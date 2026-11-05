import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers & Zavodlar')
@Controller('api/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Yetkazib beruvchilar va zavodlar ro‘yxatini olish' })
  @ApiResponse({ status: 200, description: 'Yetkazib beruvchilar ro‘yxati' })
  async findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha yetkazib beruvchi profili va mahsulotlarini olish' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID', example: 'supp-uuid-123' })
  @ApiResponse({ status: 200, description: 'Yetkazib beruvchi ma’lumotlari' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async findById(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Yetkazib beruvchining real aylanma, toshgan buyurtmalar va qarz statistikasi' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID', example: 'supp-uuid-123' })
  @ApiResponse({ status: 200, description: 'Statistika ko‘rsatkichlari' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async getStats(@Param('id') id: string) {
    return this.suppliersService.getStats(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi yetkazib beruvchi / zavod kabinetini ro‘yxatdan o‘tkazish' })
  @ApiBody({ type: CreateSupplierDto })
  @ApiResponse({ status: 201, description: 'Yetkazib beruvchi kabineti yaratildi' })
  @ApiResponse({ status: 409, description: 'STIR yoki login allaqachon mavjud' })
  async create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yetkazib beruvchi ma’lumotlarini tahrirlash' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID' })
  @ApiBody({ type: UpdateSupplierDto })
  @ApiResponse({ status: 200, description: 'Ma’lumotlar yangilandi' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yetkazib beruvchi holatini yangilash (active | pending | suspended)' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID' })
  @ApiResponse({ status: 200, description: 'Holat yangilandi' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.suppliersService.updateStatus(id, status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yetkazib beruvchi kabinetini o‘chirish' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID' })
  @ApiResponse({ status: 200, description: 'Muvaffaqiyatli o‘chirildi' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async delete(@Param('id') id: string) {
    return this.suppliersService.delete(id);
  }
}
