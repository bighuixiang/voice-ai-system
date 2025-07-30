import { Test, TestingModule } from '@nestjs/testing';
import { DocumentParserService } from './document-parser.service';

describe('DocumentParserService', () => {
  let service: DocumentParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentParserService],
    }).compile();

    service = module.get<DocumentParserService>(DocumentParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseDocument', () => {
    it('should parse a markdown document correctly', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        size: 1024,
        buffer: Buffer.from(`# Main Title

This is the introduction paragraph.

## Section 1

Content for section 1 with some **bold** text.

## Section 2

Content for section 2 with *italic* text and a [link](http://example.com).

### Subsection 2.1

Nested content here.`),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.title).toBe('Main Title');
      expect(result.metadata.format).toBe('markdown');
      expect(result.sections).toHaveLength(4); // Main content + 3 sections
      expect(result.sections[0].title).toBe('Section 1');
      expect(result.sections[0].level).toBe(2);
      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should parse a text document correctly', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'document.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 512,
        buffer: Buffer.from(`This is the first paragraph of the document.

This is the second paragraph with more content.

And this is the third paragraph with even more information.`),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.title).toBe('document');
      expect(result.metadata.format).toBe('text');
      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].title).toBe('This is the first paragraph of the document');
      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should extract title from markdown header', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.md',
        encoding: '7bit',
        mimetype: 'text/markdown',
        size: 100,
        buffer: Buffer.from('# Custom Title\n\nSome content here.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.title).toBe('Custom Title');
    });

    it('should generate keywords excluding stop words', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 200,
        buffer: Buffer.from('JavaScript programming language tutorial with examples and best practices for developers'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.keywords).toContain('javascript');
      expect(result.keywords).toContain('programming');
      expect(result.keywords).toContain('tutorial');
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('and');
      expect(result.keywords).not.toContain('with');
    });

    it('should handle empty documents', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'empty.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.from(''),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.title).toBe('empty');
      expect(result.content).toBe('');
      expect(result.keywords).toHaveLength(0);
      expect(result.sections).toHaveLength(0);
    });

    it('should count words and lines correctly', () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 100,
        buffer: Buffer.from('Line one with five words.\nLine two with four words.\nLine three.'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const result = service.parseDocument(mockFile);

      expect(result.metadata.wordCount).toBe(12); // Total words
      expect(result.metadata.lineCount).toBe(3); // Total lines
    });
  });
});