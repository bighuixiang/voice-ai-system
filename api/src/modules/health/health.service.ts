import { Injectable, Logger } from '@nestjs/common';
import { AIClientService } from '../../services/ai-client.service';

export interface HealthStatus {
  status: 'up' | 'down';
  timestamp: Date;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    api: HealthStatus;
    aiService: HealthStatus;
    memory: HealthStatus;
  };
  timestamp: Date;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly aiClientService: AIClientService) {}

  async checkSystemHealth(): Promise<SystemHealth> {
    const [aiServiceHealth, memoryHealth] = await Promise.all([
      this.checkAIServiceHealth(),
      this.checkMemoryUsage(),
    ]);

    const apiHealth: HealthStatus = {
      status: 'up',
      timestamp: new Date(),
      details: { service: 'voice-ai-api' },
    };

    const services = {
      api: apiHealth,
      aiService: aiServiceHealth,
      memory: memoryHealth,
    };

    // Determine overall health
    const unhealthyServices = Object.values(services).filter(
      (service) => service.status === 'down'
    );

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthyServices.length === 0) {
      overall = 'healthy';
    } else if (unhealthyServices.length === 1) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      services,
      timestamp: new Date(),
    };
  }

  async checkAIServiceHealth(): Promise<HealthStatus> {
    try {
      const response = await this.aiClientService.ping();
      return {
        status: 'up',
        timestamp: new Date(),
        details: response,
      };
    } catch (error) {
      this.logger.warn(`AI service health check failed: ${error.message}`);
      return {
        status: 'down',
        timestamp: new Date(),
        details: { error: error.message },
      };
    }
  }

  async checkMemoryUsage(): Promise<HealthStatus> {
    const memUsage = process.memoryUsage();
    const isHealthy = memUsage.heapUsed < memUsage.heapTotal * 0.9;

    return {
      status: isHealthy ? 'up' : 'down',
      timestamp: new Date(),
      details: {
        memoryUsage: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
          rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        },
        healthyThreshold: '90%',
      },
    };
  }
}