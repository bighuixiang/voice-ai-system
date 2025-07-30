import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

export interface TempFileInfo {
  id: string;
  originalName: string;
  filePath: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class TempFileService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TempFileService.name);
  private readonly tempFiles = new Map<string, TempFileInfo>();
  private readonly uploadPath: string;
  private readonly defaultTTL = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.uploadPath = this.configService.get('UPLOAD_PATH') || './uploads';
  }

  onModuleInit() {
    this.ensureUploadDirectory();
    this.startCleanupScheduler();
  }

  onModuleDestroy() {
    this.stopCleanupScheduler();
    this.cleanupAllTempFiles();
  }

  async saveTempFile(
    file: Express.Multer.File,
    ttlMs: number = this.defaultTTL
  ): Promise<TempFileInfo> {
    const fileId = this.generateFileId();
    const extension = this.getFileExtension(file.originalname);
    const fileName = `${fileId}${extension}`;
    const filePath = path.join(this.uploadPath, fileName);

    try {
      // Write file to disk
      await fs.promises.writeFile(filePath, file.buffer);

      const tempFileInfo: TempFileInfo = {
        id: fileId,
        originalName: file.originalname,
        filePath,
        size: file.size,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs),
      };

      this.tempFiles.set(fileId, tempFileInfo);
      
      this.logger.debug(`Temp file saved: ${fileName} (ID: ${fileId})`);
      
      return tempFileInfo;
    } catch (error) {
      this.logger.error(`Failed to save temp file: ${error.message}`);
      throw error;
    }
  }

  getTempFile(fileId: string): TempFileInfo | null {
    const tempFile = this.tempFiles.get(fileId);
    
    if (!tempFile) {
      return null;
    }

    // Check if file has expired
    if (Date.now() > tempFile.expiresAt.getTime()) {
      this.deleteTempFile(fileId);
      return null;
    }

    return tempFile;
  }

  async readTempFile(fileId: string): Promise<Buffer | null> {
    const tempFile = this.getTempFile(fileId);
    
    if (!tempFile) {
      return null;
    }

    try {
      return await fs.promises.readFile(tempFile.filePath);
    } catch (error) {
      this.logger.error(`Failed to read temp file ${fileId}: ${error.message}`);
      this.deleteTempFile(fileId);
      return null;
    }
  }

  deleteTempFile(fileId: string): boolean {
    const tempFile = this.tempFiles.get(fileId);
    
    if (!tempFile) {
      return false;
    }

    try {
      // Delete file from disk
      if (fs.existsSync(tempFile.filePath)) {
        fs.unlinkSync(tempFile.filePath);
      }

      // Remove from memory
      this.tempFiles.delete(fileId);
      
      this.logger.debug(`Temp file deleted: ${fileId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete temp file ${fileId}: ${error.message}`);
      return false;
    }
  }  ext
endTempFile(fileId: string, additionalTtlMs: number): boolean {
    const tempFile = this.tempFiles.get(fileId);
    
    if (!tempFile) {
      return false;
    }

    tempFile.expiresAt = new Date(tempFile.expiresAt.getTime() + additionalTtlMs);
    this.logger.debug(`Temp file TTL extended: ${fileId}`);
    
    return true;
  }

  getTempFileStats() {
    const now = Date.now();
    const activeFiles = Array.from(this.tempFiles.values()).filter(
      file => now <= file.expiresAt.getTime()
    );
    const expiredFiles = Array.from(this.tempFiles.values()).filter(
      file => now > file.expiresAt.getTime()
    );

    const totalSize = activeFiles.reduce((sum, file) => sum + file.size, 0);

    return {
      totalFiles: this.tempFiles.size,
      activeFiles: activeFiles.length,
      expiredFiles: expiredFiles.length,
      totalSize: this.formatFileSize(totalSize),
      uploadPath: this.uploadPath,
      defaultTTL: this.defaultTTL,
    };
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
      this.logger.log(`Created upload directory: ${this.uploadPath}`);
    }
  }

  private startCleanupScheduler() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFiles();
    }, 5 * 60 * 1000); // Run every 5 minutes

    this.logger.log('Temp file cleanup scheduler started');
  }

  private stopCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('Temp file cleanup scheduler stopped');
    }
  }

  private cleanupExpiredFiles() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [fileId, tempFile] of this.tempFiles.entries()) {
      if (now > tempFile.expiresAt.getTime()) {
        if (this.deleteTempFile(fileId)) {
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired temp files`);
    }
  }

  private cleanupAllTempFiles() {
    const fileIds = Array.from(this.tempFiles.keys());
    let cleanedCount = 0;

    for (const fileId of fileIds) {
      if (this.deleteTempFile(fileId)) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up all ${cleanedCount} temp files on shutdown`);
    }
  }

  private generateFileId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
  }
}