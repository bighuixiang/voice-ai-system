import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('api/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async checkHealth() {
    return this.healthService.checkSystemHealth();
  }

  @Get('ai-service')
  async checkAIService() {
    return this.healthService.checkAIServiceHealth();
  }

  @Get('memory')
  async checkMemory() {
    return this.healthService.checkMemoryUsage();
  }
}