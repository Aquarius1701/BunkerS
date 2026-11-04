import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';

@ApiTags('AI & Google Maps Grounding')
@Controller('api')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('maps/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google Maps va Gemini orqali qurilish ob’yektlarini qidirish' })
  @ApiResponse({ status: 200, description: 'Xarita koordinatalari va ma’lumotlar' })
  searchMaps(@Body() body: { query?: string; latitude?: number; longitude?: number }) {
    return this.aiService.searchMaps(body);
  }

  @Post('ai/esco-calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ESCO energiya tejamkorlik audit kalkulyatsiyasi' })
  @ApiResponse({ status: 200, description: 'Energiya tejash hisob-kitoblari' })
  calculateEsco(@Body() body: any) {
    return this.aiService.calculateEsco(body);
  }
}
