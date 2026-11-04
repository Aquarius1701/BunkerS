import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('System & Health Checks')
@Controller('api/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Tizim va ma’lumotlar bazasi sog‘lomligini tekshirish (Health Check)',
    description:
      'Docker va Kubernetes orchestratorlari uchun liveness va readiness probelarini taqdim etadi.',
  })
  @ApiResponse({ status: 200, description: 'Tizim to‘liq ishchi holatda' })
  check() {
    return this.healthService.checkHealth();
  }

  @Get('ping')
  @ApiOperation({ summary: 'Liveness probe oddiy ping' })
  ping() {
    return { status: 'ok', message: 'pong' };
  }
}
