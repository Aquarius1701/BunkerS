import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuerySupplierDto } from './dto/query-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers & Factories')
@Controller('api/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha faol yetkazib beruvchi va zavodlar ro‘yxatini olish' })
  @ApiResponse({ status: 200, description: 'Yetkazib beruvchilar ro‘yxati' })
  async findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yetkazib beruvchining moliyaviy va savdo statistikasini olish' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID', example: 'sup-123' })
  @ApiResponse({ status: 200, description: 'Statistika ko‘rsatkichlari' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async getStats(@Param('id') id: string) {
    return this.suppliersService.getStats(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha bitta yetkazib beruvchi profili va mahsulotlarini olish' })
  @ApiParam({ name: 'id', description: 'Yetkazib beruvchi UUID', example: 'sup-123' })
  @ApiResponse({ status: 200, description: 'Yetkazib beruvchi profili' })
  @ApiResponse({ status: 404, description: 'Yetkazib beruvchi topilmadi' })
  async findById(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }
}
