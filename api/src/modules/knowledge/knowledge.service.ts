import { Injectable, Logger } from '@nestjs/common';
import { MemoryStorageService } from '../../services/memory-storage.service';
import { KnowledgeLoaderService } from '../../services/knowledge-loader.service';
import { DocumentParserService, ParsedDocument } from '../../services/document-parser.service';
import { KnowledgeSearchService } from '../../services/knowledge-search.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly memoryStorage: MemoryStorageService,
    private readonly knowledgeLoader: KnowledgeLoaderService,
    private readonly documentParser: DocumentParserService,
    private readonly knowledgeSearch: KnowledgeSearchService,
  ) {}

  async uploadDocument(file: Express.Multer.File) {
    try {
      // Parse document using enhanced parser
      const parsedDoc: ParsedDocument = this.documentParser.parseDocument(file);
      
      // Add document to memory storage with enhanced keywords
      const documentId = this.memoryStorage.addDocumentWithMetadata(
        parsedDoc.title,
        parsedDoc.content,
        parsedDoc.keywords,
        {
          format: parsedDoc.metadata.format,
          size: parsedDoc.metadata.size,
          wordCount: parsedDoc.metadata.wordCount,
          lineCount: parsedDoc.metadata.lineCount,
          sections: parsedDoc.sections,
          originalFilename: file.originalname,
        }
      );
      
      // Save to file system for persistence
      try {
        await this.knowledgeLoader.saveDocumentToFile(parsedDoc.title, parsedDoc.content);
      } catch (saveError) {
        this.logger.warn(`Failed to save document to file: ${saveError.message}`);
      }
      
      this.logger.log(`Document uploaded and parsed: ${file.originalname} (ID: ${documentId})`);
      this.logger.debug(`Extracted ${parsedDoc.keywords.length} keywords and ${parsedDoc.sections.length} sections`);
      
      return {
        id: documentId,
        title: parsedDoc.title,
        filename: file.originalname,
        size: file.size,
        format: parsedDoc.metadata.format,
        wordCount: parsedDoc.metadata.wordCount,
        keywordCount: parsedDoc.keywords.length,
        sectionCount: parsedDoc.sections.length,
        keywords: parsedDoc.keywords.slice(0, 10), // Show first 10 keywords
        sections: parsedDoc.sections.map(section => ({
          title: section.title,
          level: section.level,
          contentLength: section.content.length,
        })),
        status: 'uploaded',
        message: 'Document uploaded, parsed, and indexed successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Document upload failed: ${error.message}`);
      throw error;
    }
  }

  async searchKnowledge(query: string, limit?: number) {
    try {
      const searchResults = this.knowledgeSearch.searchKnowledge(query, limit || 5);
      
      this.logger.debug(`Enhanced knowledge search for "${query}" returned ${searchResults.length} results`);
      
      return {
        query,
        results: searchResults.map(result => ({
          id: result.document.id,
          title: result.document.title,
          snippet: result.snippet,
          relevanceScore: Math.round(result.relevanceScore * 100) / 100,
          matchedKeywords: result.matchedKeywords,
          matchedSections: result.matchedSections,
          keywords: result.document.keywords.slice(0, 10),
          createdAt: result.document.createdAt,
          metadata: result.document.metadata ? {
            format: result.document.metadata.format,
            wordCount: result.document.metadata.wordCount,
            sectionCount: result.document.metadata.sections.length,
          } : undefined,
        })),
        total: searchResults.length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Knowledge search failed: ${error.message}`);
      throw error;
    }
  }

  async getDocuments() {
    try {
      const documents = this.memoryStorage.getAllDocuments();
      
      return {
        documents: documents.map(doc => ({
          id: doc.id,
          title: doc.title,
          keywordCount: doc.keywords.length,
          contentLength: doc.content.length,
          createdAt: doc.createdAt,
        })),
        total: documents.length,
        memoryStats: this.memoryStorage.getMemoryStats(),
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Get documents failed: ${error.message}`);
      throw error;
    }
  }

  async getDocument(id: string) {
    try {
      const document = this.memoryStorage.getDocument(id);
      
      if (!document) {
        return {
          success: false,
          message: 'Document not found',
          timestamp: new Date(),
        };
      }

      return {
        success: true,
        document: {
          id: document.id,
          title: document.title,
          content: document.content,
          keywords: document.keywords,
          createdAt: document.createdAt,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Get document failed: ${error.message}`);
      throw error;
    }
  }

  async deleteDocument(id: string) {
    try {
      const removed = this.memoryStorage.removeDocument(id);
      
      if (!removed) {
        return {
          success: false,
          message: 'Document not found',
          timestamp: new Date(),
        };
      }

      this.logger.log(`Document deleted: ${id}`);
      
      return {
        success: true,
        message: 'Document deleted successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Delete document failed: ${error.message}`);
      throw error;
    }
  }

  async reloadKnowledge() {
    try {
      const result = await this.knowledgeLoader.reloadKnowledge();
      
      return {
        success: true,
        loaded: result.loaded,
        errors: result.errors,
        message: `Knowledge base reloaded: ${result.loaded} documents`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Reload knowledge failed: ${error.message}`);
      throw error;
    }
  }

  async getKnowledgeStats() {
    try {
      const stats = this.knowledgeLoader.getKnowledgeStats();
      
      return {
        success: true,
        stats,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Get knowledge stats failed: ${error.message}`);
      throw error;
    }
  }

  async exportKnowledge() {
    try {
      const exportData = await this.knowledgeLoader.exportKnowledge();
      
      return {
        success: true,
        filename: exportData.filename,
        content: exportData.content,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Export knowledge failed: ${error.message}`);
      throw error;
    }
  }

  async importKnowledge(importData: any) {
    try {
      const result = await this.knowledgeLoader.importKnowledge(importData);
      
      return {
        success: true,
        imported: result.imported,
        errors: result.errors,
        message: `Knowledge import completed: ${result.imported} documents imported`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Import knowledge failed: ${error.message}`);
      throw error;
    }
  }

  async advancedSearch(options: {
    query: string;
    limit?: number;
    minRelevanceScore?: number;
    includeMetadata?: boolean;
  }) {
    try {
      const searchResults = this.knowledgeSearch.advancedSearch(options);
      
      this.logger.debug(`Advanced search for "${options.query}" returned ${searchResults.length} results`);
      
      return {
        query: options.query,
        options,
        results: searchResults.map(result => ({
          id: result.document.id,
          title: result.document.title,
          snippet: result.snippet,
          relevanceScore: Math.round(result.relevanceScore * 100) / 100,
          matchedKeywords: result.matchedKeywords,
          matchedSections: result.matchedSections,
          keywords: result.document.keywords.slice(0, 10),
          createdAt: result.document.createdAt,
          metadata: result.document.metadata,
        })),
        total: searchResults.length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Advanced search failed: ${error.message}`);
      throw error;
    }
  }

  async getSearchSuggestions(queryPrefix: string, limit?: number) {
    try {
      const suggestions = this.knowledgeSearch.getSearchSuggestions(queryPrefix, limit || 5);
      
      return {
        queryPrefix,
        suggestions,
        count: suggestions.length,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Get search suggestions failed: ${error.message}`);
      throw error;
    }
  }

  async getSearchStats() {
    try {
      const stats = this.knowledgeSearch.getSearchStats();
      
      return {
        success: true,
        stats,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Get search stats failed: ${error.message}`);
      throw error;
    }
  }

  async clearSearchHistory() {
    try {
      this.knowledgeSearch.clearSearchHistory();
      
      return {
        success: true,
        message: 'Search history cleared successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Clear search history failed: ${error.message}`);
      throw error;
    }
  }
}