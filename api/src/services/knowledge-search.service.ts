import { Injectable, Logger } from '@nestjs/common';
import { MemoryStorageService, KnowledgeDocument } from './memory-storage.service';

export interface SearchResult {
  document: KnowledgeDocument;
  relevanceScore: number;
  matchedKeywords: string[];
  matchedSections: string[];
  snippet: string;
}

export interface SearchQuery {
  query: string;
  timestamp: Date;
  resultsCount: number;
  executionTime: number;
}

export interface SearchStats {
  totalSearches: number;
  averageResultsPerSearch: number;
  mostSearchedTerms: { term: string; count: number }[];
  recentSearches: SearchQuery[];
}

@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);
  private readonly searchHistory: SearchQuery[] = [];
  private readonly searchTermFrequency = new Map<string, number>();

  constructor(private readonly memoryStorage: MemoryStorageService) {}

  /**
   * Enhanced search with relevance scoring and ranking
   */
  searchKnowledge(query: string, limit: number = 5): SearchResult[] {
    const startTime = Date.now();
    
    // Normalize and tokenize query
    const queryTerms = this.normalizeQuery(query);
    
    // Get all documents
    const allDocuments = this.memoryStorage.getAllDocuments();
    
    // Calculate relevance scores for each document
    const scoredResults = allDocuments
      .map(doc => this.calculateRelevanceScore(doc, queryTerms))
      .filter(result => result.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    const executionTime = Date.now() - startTime;
    
    // Record search in history
    this.recordSearch(query, scoredResults.length, executionTime);
    
    this.logger.debug(`Search for "${query}" returned ${scoredResults.length} results in ${executionTime}ms`);
    
    return scoredResults;
  }

  /**
   * Search with advanced filters and options
   */
  advancedSearch(options: {
    query: string;
    limit?: number;
    minRelevanceScore?: number;
    includeMetadata?: boolean;
    searchInSections?: boolean;
  }): SearchResult[] {
    const {
      query,
      limit = 5,
      minRelevanceScore = 0.1,
      includeMetadata = false,
      searchInSections = true
    } = options;

    const results = this.searchKnowledge(query, limit * 2); // Get more results for filtering
    
    return results
      .filter(result => result.relevanceScore >= minRelevanceScore)
      .slice(0, limit)
      .map(result => ({
        ...result,
        document: includeMetadata ? result.document : {
          ...result.document,
          metadata: undefined
        }
      }));
  }

  /**
   * Get search suggestions based on query prefix
   */
  getSearchSuggestions(queryPrefix: string, limit: number = 5): string[] {
    const normalizedPrefix = queryPrefix.toLowerCase().trim();
    
    if (normalizedPrefix.length < 2) {
      return [];
    }

    // Get suggestions from search history
    const historySuggestions = this.searchHistory
      .map(search => search.query)
      .filter(query => query.toLowerCase().includes(normalizedPrefix))
      .filter((query, index, arr) => arr.indexOf(query) === index) // Remove duplicates
      .slice(0, limit);

    // Get suggestions from document keywords
    const allDocuments = this.memoryStorage.getAllDocuments();
    const keywordSuggestions = new Set<string>();
    
    for (const doc of allDocuments) {
      for (const keyword of doc.keywords) {
        if (keyword.toLowerCase().includes(normalizedPrefix)) {
          keywordSuggestions.add(keyword);
        }
      }
    }

    // Combine and limit suggestions
    const allSuggestions = [
      ...historySuggestions,
      ...Array.from(keywordSuggestions)
    ];

    return allSuggestions
      .filter((suggestion, index, arr) => arr.indexOf(suggestion) === index)
      .slice(0, limit);
  }

  /**
   * Get search statistics and usage analytics
   */
  getSearchStats(): SearchStats {
    const totalSearches = this.searchHistory.length;
    const averageResultsPerSearch = totalSearches > 0 
      ? this.searchHistory.reduce((sum, search) => sum + search.resultsCount, 0) / totalSearches
      : 0;

    // Get most searched terms
    const mostSearchedTerms = Array.from(this.searchTermFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    // Get recent searches (last 20)
    const recentSearches = this.searchHistory
      .slice(-20)
      .reverse();

    return {
      totalSearches,
      averageResultsPerSearch: Math.round(averageResultsPerSearch * 100) / 100,
      mostSearchedTerms,
      recentSearches,
    };
  }

  /**
   * Clear search history
   */
  clearSearchHistory(): void {
    this.searchHistory.length = 0;
    this.searchTermFrequency.clear();
    this.logger.log('Search history cleared');
  }

  /**
   * Normalize query string for better matching
   */
  private normalizeQuery(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep only words and Chinese characters
      .split(/\s+/)
      .filter(term => term.length > 1)
      .filter(term => !this.isStopWord(term));
  }

  /**
   * Calculate relevance score for a document against query terms
   */
  private calculateRelevanceScore(document: KnowledgeDocument, queryTerms: string[]): SearchResult {
    let totalScore = 0;
    const matchedKeywords: string[] = [];
    const matchedSections: string[] = [];
    
    // Score based on title matches (highest weight)
    const titleWords = document.title.toLowerCase().split(/\s+/);
    for (const term of queryTerms) {
      if (titleWords.some(word => word.includes(term))) {
        totalScore += 10;
        matchedKeywords.push(term);
      }
    }

    // Score based on keyword matches (high weight)
    for (const keyword of document.keywords) {
      for (const term of queryTerms) {
        if (keyword.includes(term)) {
          totalScore += 5;
          if (!matchedKeywords.includes(term)) {
            matchedKeywords.push(term);
          }
        }
      }
    }

    // Score based on content matches (medium weight)
    const contentWords = document.content.toLowerCase().split(/\s+/);
    for (const term of queryTerms) {
      const matches = contentWords.filter(word => word.includes(term)).length;
      totalScore += matches * 1;
      if (matches > 0 && !matchedKeywords.includes(term)) {
        matchedKeywords.push(term);
      }
    }

    // Score based on section matches (if metadata available)
    if (document.metadata?.sections) {
      for (const section of document.metadata.sections) {
        const sectionWords = section.content.toLowerCase().split(/\s+/);
        for (const term of queryTerms) {
          if (sectionWords.some(word => word.includes(term))) {
            totalScore += 2;
            if (!matchedSections.includes(section.title)) {
              matchedSections.push(section.title);
            }
          }
        }
      }
    }

    // Normalize score based on document length
    const normalizedScore = totalScore / Math.log(document.content.length + 1);
    
    // Generate snippet
    const snippet = this.generateSnippet(document.content, queryTerms);

    return {
      document,
      relevanceScore: normalizedScore,
      matchedKeywords,
      matchedSections,
      snippet,
    };
  }

  /**
   * Generate a snippet highlighting matched terms
   */
  private generateSnippet(content: string, queryTerms: string[], maxLength: number = 200): string {
    const sentences = content.split(/[.!?]+/);
    let bestSentence = '';
    let maxMatches = 0;

    // Find sentence with most query term matches
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const matches = queryTerms.filter(term => sentenceLower.includes(term)).length;
      
      if (matches > maxMatches) {
        maxMatches = matches;
        bestSentence = sentence.trim();
      }
    }

    // If no good sentence found, use beginning of content
    if (!bestSentence) {
      bestSentence = content.substring(0, maxLength);
    }

    // Truncate if too long
    if (bestSentence.length > maxLength) {
      bestSentence = bestSentence.substring(0, maxLength) + '...';
    }

    return bestSentence;
  }

  /**
   * Record search query in history
   */
  private recordSearch(query: string, resultsCount: number, executionTime: number): void {
    const searchQuery: SearchQuery = {
      query,
      timestamp: new Date(),
      resultsCount,
      executionTime,
    };

    this.searchHistory.push(searchQuery);

    // Update search term frequency
    const terms = this.normalizeQuery(query);
    for (const term of terms) {
      this.searchTermFrequency.set(term, (this.searchTermFrequency.get(term) || 0) + 1);
    }

    // Keep only last 1000 searches
    if (this.searchHistory.length > 1000) {
      this.searchHistory.shift();
    }
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      // English stop words
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      // Chinese stop words
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
      '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '里', '就是'
    ]);
    
    return stopWords.has(word);
  }
}