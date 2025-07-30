import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryStorageService } from './memory-storage.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KnowledgeLoaderService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeLoaderService.name);
  private readonly knowledgePath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly memoryStorage: MemoryStorageService,
  ) {
    this.knowledgePath = this.configService.get('KNOWLEDGE_PATH') || './knowledge';
  }

  async onModuleInit() {
    await this.loadExistingKnowledge();
  }

  async loadExistingKnowledge(): Promise<void> {
    try {
      if (!fs.existsSync(this.knowledgePath)) {
        this.logger.log(`Knowledge directory does not exist: ${this.knowledgePath}`);
        return;
      }

      const files = fs.readdirSync(this.knowledgePath);
      const supportedExtensions = ['.txt', '.md'];
      let loadedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.knowledgePath, file);
        const ext = path.extname(file).toLowerCase();

        if (supportedExtensions.includes(ext) && fs.statSync(filePath).isFile()) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const title = path.basename(file, ext);
            
            this.memoryStorage.addDocument(title, content);
            loadedCount++;
            
            this.logger.debug(`Loaded knowledge document: ${file}`);
          } catch (error) {
            this.logger.error(`Failed to load knowledge document ${file}: ${error.message}`);
          }
        }
      }

      this.logger.log(`Loaded ${loadedCount} knowledge documents from ${this.knowledgePath}`);
    } catch (error) {
      this.logger.error(`Failed to load existing knowledge: ${error.message}`);
    }
  }

  async saveDocumentToFile(title: string, content: string): Promise<string> {
    try {
      // Ensure knowledge directory exists
      if (!fs.existsSync(this.knowledgePath)) {
        fs.mkdirSync(this.knowledgePath, { recursive: true });
      }

      // Sanitize filename
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9\-_\s]/g, '').trim();
      const filename = `${sanitizedTitle}.md`;
      const filePath = path.join(this.knowledgePath, filename);

      // Add metadata header
      const fileContent = `# ${title}

> Created: ${new Date().toISOString()}
> Source: Voice AI Decision System

${content}
`;

      fs.writeFileSync(filePath, fileContent, 'utf-8');
      this.logger.log(`Saved knowledge document to file: ${filename}`);
      
      return filePath;
    } catch (error) {
      this.logger.error(`Failed to save document to file: ${error.message}`);
      throw error;
    }
  }

  async reloadKnowledge(): Promise<{ loaded: number; errors: string[] }> {
    this.logger.log('Reloading knowledge base...');
    
    const errors: string[] = [];
    let loaded = 0;

    try {
      // Clear existing knowledge base
      const existingDocs = this.memoryStorage.getAllDocuments();
      for (const doc of existingDocs) {
        this.memoryStorage.removeDocument(doc.id);
      }

      // Reload from files
      await this.loadExistingKnowledge();
      loaded = this.memoryStorage.getAllDocuments().length;
      
      this.logger.log(`Knowledge base reloaded: ${loaded} documents`);
    } catch (error) {
      errors.push(error.message);
      this.logger.error(`Knowledge reload failed: ${error.message}`);
    }

    return { loaded, errors };
  }

  getKnowledgeStats() {
    const documents = this.memoryStorage.getAllDocuments();
    const memoryStats = this.memoryStorage.getMemoryStats();
    
    return {
      totalDocuments: documents.length,
      totalKeywords: documents.reduce((sum, doc) => sum + doc.keywords.length, 0),
      averageKeywordsPerDocument: documents.length > 0 
        ? Math.round(documents.reduce((sum, doc) => sum + doc.keywords.length, 0) / documents.length)
        : 0,
      totalContentLength: documents.reduce((sum, doc) => sum + doc.content.length, 0),
      memoryUsage: memoryStats.knowledgeBase,
      knowledgePath: this.knowledgePath,
      lastLoaded: new Date(),
    };
  }

  async exportKnowledge(): Promise<{ filename: string; content: string }> {
    const documents = this.memoryStorage.getAllDocuments();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `knowledge-export-${timestamp}.json`;
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalDocuments: documents.length,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        keywords: doc.keywords,
        createdAt: doc.createdAt,
      })),
    };

    const content = JSON.stringify(exportData, null, 2);
    
    return { filename, content };
  }

  async importKnowledge(importData: any): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      if (!importData.documents || !Array.isArray(importData.documents)) {
        throw new Error('Invalid import data format');
      }

      for (const docData of importData.documents) {
        try {
          if (!docData.title || !docData.content) {
            errors.push(`Invalid document data: missing title or content`);
            continue;
          }

          this.memoryStorage.addDocument(docData.title, docData.content);
          imported++;
        } catch (error) {
          errors.push(`Failed to import document "${docData.title}": ${error.message}`);
        }
      }

      this.logger.log(`Knowledge import completed: ${imported} documents imported, ${errors.length} errors`);
    } catch (error) {
      errors.push(`Import failed: ${error.message}`);
      this.logger.error(`Knowledge import failed: ${error.message}`);
    }

    return { imported, errors };
  }
}