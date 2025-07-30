import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KnowledgeService } from './knowledge.service';
import { MemoryStorageService } from '../../services/memory-storage.service';
import { KnowledgeLoaderService } from '../../services/knowledge-loader.service';
import { DocumentParserService } from '../../services/document-parser.service';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let memoryStorage: MemoryStorageService;
  let documentParser: DocumentParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeService,
        MemoryStorageService,
        DocumentParserService,
        {
          provide: KnowledgeLoaderService,
          useValue: {
            saveDocumentToFile: jest.fn().mockResolvedValue('/path/to/file'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('./knowledge'),
          },
        },
      ],
    }).compile();

    service = module.get<KnowledgeService>(KnowledgeService);
    memoryStorage = module.get<MemoryStorageService>(MemoryStorageService);
    documentParser = module.get<DocumentParserService>(DocumentParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadDocument', () => {
    it('should upload and parse a markdown document', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test-document.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        size: 1024,
        buffer: Buffer.from('# Test Document\n\nThis is a test document with some content.\n\n## Section 1\n\nContent for section 1.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = await service.uploadDocument(mockFile);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title', 'Test Document');
      expect(result).toHaveProperty('format', 'markdown');
      expect(result).toHaveProperty('status', 'uploaded');
      expect(result.keywordCount).toBeGreaterThan(0);
      expect(result.sectionCount).toBeGreaterThan(0);
    });

    it('should upload and parse a text document', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test-document.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 512,
        buffer: Buffer.from('This is a plain text document.\n\nIt has multiple paragraphs.\n\nEach paragraph should be treated as a section.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = await service.uploadDocument(mockFile);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('title', 'test-document');
      expect(result).toHaveProperty('format', 'text');
      expect(result).toHaveProperty('status', 'uploaded');
      expect(result.keywordCount).toBeGreaterThan(0);
    });

    it('should handle document parsing errors', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'invalid.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.from(''),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      // Mock parser to throw error
      jest.spyOn(documentParser, 'parseDocument').mockImplementation(() => {
        throw new Error('Invalid document format');
      });

      await expect(service.uploadDocument(mockFile)).rejects.toThrow('Invalid document format');
    });
  });

  describe('searchKnowledge', () => {
    beforeEach(async () => {
      // Add some test documents
      const mockFile1: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'doc1.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        size: 1024,
        buffer: Buffer.from('# JavaScript Guide\n\nThis document covers JavaScript programming concepts.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const mockFile2: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'doc2.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        size: 1024,
        buffer: Buffer.from('# Python Tutorial\n\nLearn Python programming with examples.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await service.uploadDocument(mockFile1);
      await service.uploadDocument(mockFile2);
    });

    it('should search and return relevant documents', async () => {
      const result = await service.searchKnowledge('JavaScript');

      expect(result).toHaveProperty('query', 'JavaScript');
      expect(result).toHaveProperty('results');
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]).toHaveProperty('title', 'JavaScript Guide');
    });

    it('should return empty results for non-matching query', async () => {
      const result = await service.searchKnowledge('nonexistent');

      expect(result).toHaveProperty('query', 'nonexistent');
      expect(result).toHaveProperty('results');
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBe(0);
    });
  });
});