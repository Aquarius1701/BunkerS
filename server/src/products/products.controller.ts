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
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('api/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha mahsulotlarni qidirish va filtrlash' })
  @ApiResponse({ status: 200, description: 'Mahsulotlar ro‘yxati muvaffaqiyatli olindi' })
  async findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Mahsulot kategoriyalari va ulardagi tovarlar soni' })
  @ApiResponse({ status: 200, description: 'Kategoriyalar ro‘yxati' })
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha bitta mahsulot tafsilotlarini olish' })
  @ApiParam({ name: 'id', description: 'Mahsulot UUID', example: 'uuid-123' })
  @ApiResponse({ status: 200, description: 'Mahsulot tafsilotlari' })
  @ApiResponse({ status: 404, description: 'Mahsulot topilmadi' })
  async findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi mahsulot yaratish (Autentifikatsiyadan o‘tgan sotuvchilar)' })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({ status: 201, description: 'Mahsulot muvaffaqiyatli yaratildi' })
  @ApiResponse({ status: 400, description: 'Noto‘g‘ri ma’lumotlar kiritildi' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mavjud mahsulotni yangilash' })
  @ApiParam({ name: 'id', description: 'Mahsulot UUID', example: 'uuid-123' })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({ status: 200, description: 'Mahsulot yangilandi' })
  @ApiResponse({ status: 404, description: 'Mahsulot topilmadi' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mahsulotni o‘chirish' })
  @ApiParam({ name: 'id', description: 'Mahsulot UUID', example: 'uuid-123' })
  @ApiResponse({ status: 200, description: 'Mahsulot muvaffaqiyatli o‘chirildi' })
  @ApiResponse({ status: 404, description: 'Mahsulot topilmadi' })
  async delete(@Param('id') id: string) {
    return this.productsService.delete(id);
  }
}
