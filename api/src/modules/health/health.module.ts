import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { AIClientService } from '../../services/ai-client.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, AIClientService],
  exports: [HealthService],
})
export class HealthModule {}