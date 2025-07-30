import { Injectable, Logger } from '@nestjs/common';
import { DocumentSection } from './document-parser.service';

export interface CacheItem {
  value: any;
  expires: number | null;
  createdAt: Date;
}

export interface DocumentMetadata {
  format: string;
  size: number;
  wordCount: number;
  lineCount: number;
  sections: DocumentSection[];
  originalFilename: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  keywords: string[];
  createdAt: Date;
  metadata?: DocumentMetadata;
}

@Injectable()
export class MemoryStorageService {
  private readonly logger = new Logger(MemoryStorageService.name);
  private readonly cache = new Map<string, CacheItem>();
  private readonly knowledgeBase = new Map<string, KnowledgeDocument>();
  private readonly keywordIndex = new Map<string, string[]>();

  // Cache operations
  set(key: string, value: any, ttlSeconds?: number): void {
    const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    
    this.cache.set(key, {
      value,
      expires,
      createdAt: new Date(),
    });

    this.logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds || 'none'}s)`);
  }

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    // Check if expired
    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key);
      this.logger.debug(`Cache expired and removed: ${key}`);
      return null;
    }

    return item.value;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.logger.debug(`Cache deleted: ${key}`);
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.logger.log('Cache cleared');
  }

  // Knowledge base operations
  addDocument(title: string, content: string): string {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const keywords = this.extractKeywords(content);

    const document: KnowledgeDocument = {
      id,
      title,
      content,
      keywords,
      createdAt: new Date(),
    };

    this.knowledgeBase.set(id, document);
    this.updateKeywordIndex(id, keywords);

    this.logger.log(`Knowledge document added: ${title} (ID: ${id})`);
    return id;
  }

  addDocumentWithMetadata(
    title: string, 
    content: string, 
    keywords: string[], 
    metadata: DocumentMetadata
  ): string {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const document: KnowledgeDocument = {
      id,
      title,
      content,
      keywords,
      createdAt: new Date(),
      metadata,
    };

    this.knowledgeBase.set(id, document);
    this.updateKeywordIndex(id, keywords);

    this.logger.log(`Knowledge document added with metadata: ${title} (ID: ${id})`);
    this.logger.debug(`Document metadata: ${metadata.format}, ${metadata.wordCount} words, ${metadata.sections.length} sections`);
    return id;
  }

  getDocument(id: string): KnowledgeDocument | null {
    return this.knowledgeBase.get(id) || null;
  }

  searchDocuments(query: string, limit: number = 5): KnowledgeDocument[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const relevantDocIds = new Set<string>();

    // Find documents containing query keywords
    for (const word of queryWords) {
      const docIds = this.keywordIndex.get(word) || [];
      docIds.forEach(id => relevantDocIds.add(id));
    }

    // Get documents and sort by relevance
    const results = Array.from(relevantDocIds)
      .map(id => this.knowledgeBase.get(id))
      .filter(doc => doc !== undefined)
      .map(doc => ({
        document: doc!,
        relevance: this.calculateRelevance(doc!, queryWords),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
      .map(item => item.document);

    this.logger.debug(`Knowledge search for "${query}" returned ${results.length} results`);
    return results;
  }

  getAllDocuments(): KnowledgeDocument[] {
    return Array.from(this.knowledgeBase.values());
  }

  removeDocument(id: string): boolean {
    const document = this.knowledgeBase.get(id);
    if (!document) {
      return false;
    }

    this.knowledgeBase.delete(id);
    this.removeFromKeywordIndex(id, document.keywords);

    this.logger.log(`Knowledge document removed: ${document.title} (ID: ${id})`);
    return true;
  }

  // Memory usage statistics
  getMemoryStats() {
    const cacheSize = this.cache.size;
    const knowledgeSize = this.knowledgeBase.size;
    const indexSize = this.keywordIndex.size;

    return {
      cache: {
        items: cacheSize,
        memoryUsage: this.estimateMapMemoryUsage(this.cache),
      },
      knowledgeBase: {
        documents: knowledgeSize,
        memoryUsage: this.estimateMapMemoryUsage(this.knowledgeBase),
      },
      keywordIndex: {
        keywords: indexSize,
        memoryUsage: this.estimateMapMemoryUsage(this.keywordIndex),
      },
    };
  }

  // Cleanup expired cache items
  cleanupExpiredCache(): number {
    let removedCount = 0;
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.expires && now > item.expires) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Cleaned up ${removedCount} expired cache items`);
    }

    return removedCount;
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - split by whitespace and filter
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
      .slice(0, 50); // Limit to 50 keywords per document
  }

  private updateKeywordIndex(docId: string, keywords: string[]): void {
    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, []);
      }
      this.keywordIndex.get(keyword)!.push(docId);
    }
  }

  private removeFromKeywordIndex(docId: string, keywords: string[]): void {
    for (const keyword of keywords) {
      const docIds = this.keywordIndex.get(keyword);
      if (docIds) {
        const index = docIds.indexOf(docId);
        if (index > -1) {
          docIds.splice(index, 1);
          if (docIds.length === 0) {
            this.keywordIndex.delete(keyword);
          }
        }
      }
    }
  }

  private calculateRelevance(document: KnowledgeDocument, queryWords: string[]): number {
    let relevance = 0;
    const docWords = document.content.toLowerCase().split(/\s+/);

    for (const queryWord of queryWords) {
      const matches = docWords.filter(word => word.includes(queryWord)).length;
      relevance += matches;
    }

    return relevance;
  }

  private estimateMapMemoryUsage(map: Map<any, any>): string {
    // Rough estimation of memory usage
    const estimatedBytes = map.size * 100; // Rough estimate
    if (estimatedBytes < 1024) {
      return `${estimatedBytes} B`;
    } else if (estimatedBytes < 1024 * 1024) {
      return `${Math.round(estimatedBytes / 1024)} KB`;
    } else {
      return `${Math.round(estimatedBytes / 1024 / 1024)} MB`;
    }
  }
}