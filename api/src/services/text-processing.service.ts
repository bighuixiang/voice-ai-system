import { Injectable, Logger } from '@nestjs/common';

export interface TextProcessingResult {
  originalText: string;
  processedText: string;
  metadata: {
    length: number;
    wordCount: number;
    language?: string;
    containsUnsafeContent: boolean;
    processingSteps: string[];
  };
}

@Injectable()
export class TextProcessingService {
  private readonly logger = new Logger(TextProcessingService.name);
  
  // Basic profanity filter - in production, use a more comprehensive solution
  private readonly profanityWords = [
    // Add basic profanity words here - keeping minimal for demo
    'spam', 'scam', 'hack', 'malware'
  ];

  async processText(text: string): Promise<TextProcessingResult> {
    const processingSteps: string[] = [];
    let processedText = text;

    // Step 1: Basic sanitization
    processedText = this.sanitizeText(processedText);
    processingSteps.push('sanitization');

    // Step 2: Normalize whitespace
    processedText = this.normalizeWhitespace(processedText);
    processingSteps.push('whitespace_normalization');

    // Step 3: Content safety check
    const containsUnsafeContent = this.checkUnsafeContent(processedText);
    processingSteps.push('safety_check');

    // Step 4: Language detection (basic)
    const language = this.detectLanguage(processedText);
    if (language) {
      processingSteps.push('language_detection');
    }

    // Step 5: Calculate metadata
    const wordCount = this.countWords(processedText);

    const result: TextProcessingResult = {
      originalText: text,
      processedText,
      metadata: {
        length: processedText.length,
        wordCount,
        language,
        containsUnsafeContent,
        processingSteps,
      },
    };

    this.logger.debug(`Text processed: ${text.length} -> ${processedText.length} chars`);
    
    return result;
  }

  private sanitizeText(text: string): string {
    // Remove potentially dangerous characters and normalize
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .trim();
  }

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs
      .trim();
  }

  private checkUnsafeContent(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Check for profanity
    for (const word of this.profanityWords) {
      if (lowerText.includes(word)) {
        return true;
      }
    }

    // Check for potential injection attempts
    const injectionPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  private detectLanguage(text: string): string | undefined {
    // Very basic language detection - in production, use a proper library
    const chinesePattern = /[\u4e00-\u9fff]/;
    const englishPattern = /[a-zA-Z]/;
    
    if (chinesePattern.test(text)) {
      return 'zh';
    } else if (englishPattern.test(text)) {
      return 'en';
    }
    
    return undefined;
  }

  private countWords(text: string): number {
    // Handle both English and Chinese text
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fff]/g, '') // Remove Chinese characters
      .split(/\s+/)
      .filter(word => word.length > 0).length;
    
    return chineseChars + englishWords;
  }

  validateTextInput(text: string): { isValid: boolean; error?: string } {
    // Check minimum length
    if (!text || text.trim().length === 0) {
      return { isValid: false, error: 'Text input cannot be empty' };
    }

    // Check maximum length
    const maxLength = 10000; // 10KB limit
    if (text.length > maxLength) {
      return { 
        isValid: false, 
        error: `Text input exceeds maximum length of ${maxLength} characters` 
      };
    }

    // Check for minimum meaningful content
    const meaningfulContent = text.replace(/\s+/g, '').length;
    if (meaningfulContent < 3) {
      return { isValid: false, error: 'Text input must contain meaningful content' };
    }

    return { isValid: true };
  }

  extractKeywords(text: string, limit: number = 10): string[] {
    // Simple keyword extraction - in production, use NLP libraries
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, '') // Keep only words and Chinese characters
      .split(/\s+/)
      .filter(word => word.length > 2); // Filter short words

    // Count word frequency
    const wordCount = new Map<string, number>();
    for (const word of words) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }

    // Sort by frequency and return top keywords
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }

  summarizeText(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Simple summarization - take first sentences up to maxLength
    const sentences = text.split(/[.!?。！？]/);
    let summary = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence && summary.length + trimmedSentence.length + 1 <= maxLength) {
        summary += (summary ? ' ' : '') + trimmedSentence;
      } else {
        break;
      }
    }

    return summary || text.substring(0, maxLength - 3) + '...';
  }
}