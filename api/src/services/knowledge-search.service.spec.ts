import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeSearchService } from './knowledge-search.service';
import { MemoryStorageService, KnowledgeDocument } from './memory-storage.service';

describe('KnowledgeSearchService', () => {
  let service: KnowledgeSearchService;
  let memoryStorage: MemoryStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KnowledgeSearchService, MemoryStorageService],
    }).compile();

    service = module.get<KnowledgeSearchService>(KnowledgeSearchService);
    memoryStorage = module.get<MemoryStorageService>(MemoryStorageService);

    // Add test documents
    memoryStorage.addDocumentWithMetadata(
      'JavaScript Guide',
      'JavaScript is a programming language used for web development. It supports functions, objects, and asynchronous programming.',
      ['javascript', 'programming', 'web', 'development', 'functions', 'objects', 'asynchronous'],
      {
        format: 'markdown',
        size: 1024,
        wordCount: 20,
        lineCount: 3,
        sections: [
          { title: 'Introduction', content: 'JavaScript is a programming language', level: 1 },
          { title: 'Features', content: 'It supports functions, objects, and asynchronous programming', level: 1 }
        ],
        originalFilename: 'javascript-guide.md'
      }
    );

    memoryStorage.addDocumentWithMetadata(
      'Python Tutorial',
      'Python is a high-level programming language known for its simplicity and readability. It is widely used in data science and web development.',
      ['python', 'programming', 'language', 'simplicity', 'readability', 'data', 'science', 'web'],
      {
        format: 'markdown',
        size: 512,
        wordCount: 25,
        lineCount: 2,
        sections: [
          { title: 'Overview', content: 'Python is a high-level programming language', level: 1 }
        ],
        originalFilename: 'python-tutorial.md'
      }
    );

    memoryStorage.addDocumentWithMetadata(
      'Web Development Basics',
      'Web development involves creating websites and web applications. Common technologies include HTML, CSS, JavaScript, and various frameworks.',
      ['web', 'development', 'websites', 'applications', 'html', 'css', 'javascript', 'frameworks'],
      {
        format: 'text',
        size: 256,
        wordCount: 18,
        lineCount: 2,
        sections: [
          { title: 'Technologies', content: 'Common technologies include HTML, CSS, JavaScript', level: 1 }
        ],
        originalFilename: 'web-basics.txt'
      }
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchKnowledge', () => {
    it('should return relevant documents for JavaScript query', () => {
      const results = service.searchKnowledge('JavaScript', 5);

      expect(results).toHaveLength(2); // JavaScript Guide and Web Development Basics
      expect(results[0].document.title).toBe('JavaScript Guide');
      expect(results[0].relevanceScore).toBeGreaterThan(0);
      expect(results[0].matchedKeywords).toContain('javascript');
      expect(results[0].snippet).toBeTruthy();
    });

    it('should return documents sorted by relevance score', () => {
      const results = service.searchKnowledge('programming', 5);

      expect(results.length).toBeGreaterThan(1);
      
      // Check that results are sorted by relevance score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });

    it('should limit results correctly', () => {
      const results = service.searchKnowledge('development', 1);

      expect(results).toHaveLength(1);
    });

    it('should return empty results for non-matching query', () => {
      const results = service.searchKnowledge('nonexistent', 5);

      expect(results).toHaveLength(0);
    });

    it('should generate meaningful snippets', () => {
      const results = service.searchKnowledge('programming language', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].snippet).toBeTruthy();
      expect(results[0].snippet.length).toBeGreaterThan(0);
      expect(results[0].snippet.length).toBeLessThanOrEqual(203); // 200 + '...'
    });

    it('should track matched sections', () => {
      const results = service.searchKnowledge('functions', 5);

      expect(results.length).toBeGreaterThan(0);
      const jsResult = results.find(r => r.document.title === 'JavaScript Guide');
      expect(jsResult).toBeTruthy();
      expect(jsResult!.matchedSections).toContain('Features');
    });
  });

  describe('advancedSearch', () => {
    it('should filter by minimum relevance score', () => {
      const results = service.advancedSearch({
        query: 'programming',
        minRelevanceScore: 5.0, // High threshold
        limit: 10
      });

      // Should return fewer results due to high threshold
      expect(results.length).toBeLessThanOrEqual(2);
      results.forEach(result => {
        expect(result.relevanceScore).toBeGreaterThanOrEqual(5.0);
      });
    });

    it('should respect limit parameter', () => {
      const results = service.advancedSearch({
        query: 'development',
        limit: 1
      });

      expect(results).toHaveLength(1);
    });

    it('should include/exclude metadata based on option', () => {
      const withMetadata = service.advancedSearch({
        query: 'javascript',
        includeMetadata: true,
        limit: 1
      });

      const withoutMetadata = service.advancedSearch({
        query: 'javascript',
        includeMetadata: false,
        limit: 1
      });

      expect(withMetadata[0].document.metadata).toBeTruthy();
      expect(withoutMetadata[0].document.metadata).toBeUndefined();
    });
  });

  describe('getSearchSuggestions', () => {
    beforeEach(() => {
      // Perform some searches to build history
      service.searchKnowledge('javascript programming', 5);
      service.searchKnowledge('python tutorial', 5);
      service.searchKnowledge('web development', 5);
    });

    it('should return suggestions based on search history', () => {
      const suggestions = service.getSearchSuggestions('java', 5);

      expect(suggestions).toContain('javascript programming');
    });

    it('should return suggestions based on document keywords', () => {
      const suggestions = service.getSearchSuggestions('prog', 5);

      expect(suggestions.some(s => s.includes('programming'))).toBeTruthy();
    });

    it('should return empty array for short prefix', () => {
      const suggestions = service.getSearchSuggestions('j', 5);

      expect(suggestions).toHaveLength(0);
    });

    it('should limit suggestions correctly', () => {
      const suggestions = service.getSearchSuggestions('dev', 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getSearchStats', () => {
    beforeEach(() => {
      // Perform some searches
      service.searchKnowledge('javascript', 5);
      service.searchKnowledge('python', 5);
      service.searchKnowledge('javascript', 5); // Duplicate to test frequency
    });

    it('should return correct search statistics', () => {
      const stats = service.getSearchStats();

      expect(stats.totalSearches).toBe(3);
      expect(stats.averageResultsPerSearch).toBeGreaterThan(0);
      expect(stats.mostSearchedTerms).toBeInstanceOf(Array);
      expect(stats.recentSearches).toBeInstanceOf(Array);
      expect(stats.recentSearches).toHaveLength(3);
    });

    it('should track most searched terms correctly', () => {
      const stats = service.getSearchStats();

      expect(stats.mostSearchedTerms.length).toBeGreaterThan(0);
      // 'javascript' should appear twice, so it should be at the top
      expect(stats.mostSearchedTerms[0].term).toBe('javascript');
      expect(stats.mostSearchedTerms[0].count).toBe(2);
    });

    it('should return recent searches in reverse chronological order', () => {
      const stats = service.getSearchStats();

      expect(stats.recentSearches[0].query).toBe('javascript'); // Most recent
      expect(stats.recentSearches[2].query).toBe('javascript'); // Oldest
    });
  });

  describe('clearSearchHistory', () => {
    beforeEach(() => {
      // Perform some searches
      service.searchKnowledge('javascript', 5);
      service.searchKnowledge('python', 5);
    });

    it('should clear search history', () => {
      let stats = service.getSearchStats();
      expect(stats.totalSearches).toBe(2);

      service.clearSearchHistory();

      stats = service.getSearchStats();
      expect(stats.totalSearches).toBe(0);
      expect(stats.mostSearchedTerms).toHaveLength(0);
      expect(stats.recentSearches).toHaveLength(0);
    });
  });
});