import { Injectable, Logger } from '@nestjs/common';

export interface ParsedDocument {
  title: string;
  content: string;
  metadata: {
    format: string;
    size: number;
    wordCount: number;
    lineCount: number;
  };
  sections: DocumentSection[];
  keywords: string[];
}

export interface DocumentSection {
  title: string;
  content: string;
  level: number;
}

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  /**
   * Parse document based on file format
   */
  parseDocument(file: Express.Multer.File): ParsedDocument {
    const content = file.buffer.toString('utf-8');
    const format = this.detectFormat(file);
    
    let parsedContent: ParsedDocument;
    
    switch (format) {
      case 'markdown':
        parsedContent = this.parseMarkdown(content, file);
        break;
      case 'text':
        parsedContent = this.parseText(content, file);
        break;
      default:
        throw new Error(`Unsupported document format: ${format}`);
    }

    this.logger.debug(`Parsed document: ${parsedContent.title} (${format})`);
    return parsedContent;
  }

  /**
   * Detect document format based on file extension and mime type
   */
  private detectFormat(file: Express.Multer.File): string {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    
    if (extension === 'md' || file.mimetype === 'text/markdown') {
      return 'markdown';
    } else if (extension === 'txt' || file.mimetype === 'text/plain') {
      return 'text';
    }
    
    // Fallback to text for unknown formats
    return 'text';
  }

  /**
   * Parse Markdown document
   */
  private parseMarkdown(content: string, file: Express.Multer.File): ParsedDocument {
    const title = this.extractTitle(file.originalname, content);
    const sections = this.extractMarkdownSections(content);
    const keywords = this.generateKeywords(content);
    
    return {
      title,
      content,
      metadata: {
        format: 'markdown',
        size: file.size,
        wordCount: this.countWords(content),
        lineCount: content.split('\n').length,
      },
      sections,
      keywords,
    };
  }

  /**
   * Parse plain text document
   */
  private parseText(content: string, file: Express.Multer.File): ParsedDocument {
    const title = this.extractTitle(file.originalname, content);
    const sections = this.extractTextSections(content);
    const keywords = this.generateKeywords(content);
    
    return {
      title,
      content,
      metadata: {
        format: 'text',
        size: file.size,
        wordCount: this.countWords(content),
        lineCount: content.split('\n').length,
      },
      sections,
      keywords,
    };
  }

  /**
   * Extract title from filename or document content
   */
  private extractTitle(filename: string, content: string): string {
    // Try to extract title from markdown header
    const markdownTitleMatch = content.match(/^#\s+(.+)$/m);
    if (markdownTitleMatch) {
      return markdownTitleMatch[1].trim();
    }

    // Try to extract title from first line if it looks like a title
    const firstLine = content.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 100 && !firstLine.includes('.')) {
      return firstLine;
    }

    // Fallback to filename without extension
    return filename.replace(/\.[^/.]+$/, '');
  }

  /**
   * Extract sections from Markdown content
   */
  private extractMarkdownSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const lines = content.split('\n');
    let currentSection: DocumentSection | null = null;

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          title: headerMatch[2].trim(),
          content: '',
          level: headerMatch[1].length,
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    // Add last section
    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Extract sections from plain text (paragraph-based)
   */
  private extractTextSections(content: string): DocumentSection[] {
    const sections: DocumentSection[] = [];
    const paragraphs = content.split(/\n\s*\n/);
    
    paragraphs.forEach((paragraph, index) => {
      const trimmed = paragraph.trim();
      if (trimmed) {
        const title = this.generateSectionTitle(trimmed, index);
        sections.push({
          title,
          content: trimmed,
          level: 1,
        });
      }
    });

    return sections;
  }

  /**
   * Generate section title for text documents
   */
  private generateSectionTitle(content: string, index: number): string {
    const firstSentence = content.split(/[.!?]/)[0]?.trim();
    
    if (firstSentence && firstSentence.length < 80) {
      return firstSentence;
    }
    
    return `Section ${index + 1}`;
  }

  /**
   * Generate keywords from document content
   */
  private generateKeywords(content: string): string[] {
    // Remove markdown syntax and special characters
    const cleanContent = content
      .replace(/#{1,6}\s+/g, '') // Remove markdown headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.+?)\*/g, '$1') // Remove italic
      .replace(/`(.+?)`/g, '$1') // Remove code
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep only words and Chinese characters
      .toLowerCase();

    // Extract words
    const words = cleanContent
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter short words
      .filter(word => !this.isStopWord(word)) // Filter stop words
      .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates

    // Calculate word frequency
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Sort by frequency and return top keywords
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30) // Top 30 keywords
      .map(([word]) => word);
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
      // Chinese stop words (common ones)
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
      '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '里', '就是'
    ]);
    
    return stopWords.has(word);
  }

  /**
   * Count words in content
   */
  private countWords(content: string): number {
    return content
      .replace(/[^\w\s\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0).length;
  }
}