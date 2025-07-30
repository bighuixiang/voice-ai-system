import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileInfo: {
    originalName: string;
    mimeType: string;
    size: number;
    extension: string;
  };
}

@Injectable()
export class FileValidationService {
  private readonly maxFileSize: number;
  private readonly supportedAudioFormats: string[];
  private readonly supportedDocumentFormats: string[];

  constructor(private readonly configService: ConfigService) {
    this.maxFileSize = this.parseFileSize(
      this.configService.get('MAX_FILE_SIZE') || '50MB'
    );
    
    this.supportedAudioFormats = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/flac',
      'audio/x-flac',
    ];

    this.supportedDocumentFormats = [
      'text/plain',
      'text/markdown',
      'application/octet-stream', // For .md files sometimes
    ];
  }

  validateAudioFile(file: Express.Multer.File): FileValidationResult {
    const fileInfo = this.getFileInfo(file);
    
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        isValid: false,
        error: `File size exceeds maximum allowed size of ${this.formatFileSize(this.maxFileSize)}`,
        fileInfo,
      };
    }

    // Check MIME type
    if (!this.supportedAudioFormats.includes(file.mimetype)) {
      return {
        isValid: false,
        error: `Unsupported audio format. Supported formats: ${this.getSupportedAudioExtensions().join(', ')}`,
        fileInfo,
      };
    }

    // Check file extension
    const extension = fileInfo.extension.toLowerCase();
    const supportedExtensions = this.getSupportedAudioExtensions();
    if (!supportedExtensions.includes(extension)) {
      return {
        isValid: false,
        error: `Unsupported file extension. Supported extensions: ${supportedExtensions.join(', ')}`,
        fileInfo,
      };
    }

    return {
      isValid: true,
      fileInfo,
    };
  }  valid
ateDocumentFile(file: Express.Multer.File): FileValidationResult {
    const fileInfo = this.getFileInfo(file);
    
    // Check file size (smaller limit for documents)
    const maxDocSize = Math.min(this.maxFileSize, 10 * 1024 * 1024); // 10MB max for documents
    if (file.size > maxDocSize) {
      return {
        isValid: false,
        error: `Document size exceeds maximum allowed size of ${this.formatFileSize(maxDocSize)}`,
        fileInfo,
      };
    }

    // Check MIME type
    if (!this.supportedDocumentFormats.includes(file.mimetype)) {
      return {
        isValid: false,
        error: 'Unsupported document format. Supported formats: TXT, MD',
        fileInfo,
      };
    }

    // Check file extension
    const extension = fileInfo.extension.toLowerCase();
    const supportedExtensions = ['.txt', '.md'];
    if (!supportedExtensions.includes(extension)) {
      return {
        isValid: false,
        error: `Unsupported file extension. Supported extensions: ${supportedExtensions.join(', ')}`,
        fileInfo,
      };
    }

    return {
      isValid: true,
      fileInfo,
    };
  }

  private getFileInfo(file: Express.Multer.File) {
    const extension = this.getFileExtension(file.originalname);
    
    return {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      extension,
    };
  }

  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
  }

  private getSupportedAudioExtensions(): string[] {
    return ['.wav', '.mp3', '.m4a', '.flac'];
  }

  private parseFileSize(sizeStr: string): number {
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
    
    if (!match) {
      throw new Error(`Invalid file size format: ${sizeStr}`);
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase() as keyof typeof units;
    
    return value * units[unit];
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
  }
}