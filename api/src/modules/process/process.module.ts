import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ProcessController } from './process.controller';
import { ProcessService } from './process.service';
import { AIClientService } from '../../services/ai-client.service';
import { FileValidationService } from '../../services/file-validation.service';
import { TempFileService } from '../../services/temp-file.service';
import { TextProcessingService } from '../../services/text-processing.service';
import { ProcessingFlowService } from '../../services/processing-flow.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    MulterModule.register({
      dest: './uploads',
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
      },
    }),
    CacheModule,
  ],
  controllers: [ProcessController],
  providers: [
    ProcessService, 
    AIClientService, 
    FileValidationService, 
    TempFileService,
    TextProcessingService,
    ProcessingFlowService,
  ],
  exports: [
    ProcessService, 
    FileValidationService, 
    TempFileService,
    TextProcessingService,
    ProcessingFlowService,
  ],
})
export class ProcessModule {}