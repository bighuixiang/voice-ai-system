import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { MemoryStorageService } from '../../services/memory-storage.service';
import { KnowledgeLoaderService } from '../../services/knowledge-loader.service';
import { DocumentParserService } from '../../services/document-parser.service';
import { KnowledgeSearchService } from '../../services/knowledge-search.service';

@Module({
  imports: [
    MulterModule.register({
      dest: './knowledge',
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit for knowledge documents
      },
    }),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, MemoryStorageService, KnowledgeLoaderService, DocumentParserService, KnowledgeSearchService],
  exports: [KnowledgeService, MemoryStorageService],
})
export class KnowledgeModule {}