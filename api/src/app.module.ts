import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessModule } from './modules/process/process.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { HealthModule } from './modules/health/health.module';
import { CacheModule } from './modules/cache/cache.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ProcessModule,
    KnowledgeModule,
    HealthModule,
    CacheModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}