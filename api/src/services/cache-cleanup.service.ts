import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MemoryStorageService } from './memory-storage.service';

@Injectable()
export class CacheCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheCleanupService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly memoryStorage: MemoryStorageService) {}

  onModuleInit() {
    this.startCleanupScheduler();
  }

  onModuleDestroy() {
    this.stopCleanupScheduler();
  }

  private startCleanupScheduler() {
    this.logger.log('Starting cache cleanup scheduler');
    
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private stopCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log('Cache cleanup scheduler stopped');
    }
  }

  private performCleanup() {
    try {
      const removedCount = this.memoryStorage.cleanupExpiredCache();
      
      if (removedCount > 0) {
        this.logger.log(`Cache cleanup completed: ${removedCount} expired items removed`);
      }

      // Log memory statistics periodically
      const stats = this.memoryStorage.getMemoryStats();
      this.logger.debug('Memory usage statistics:', stats);
      
    } catch (error) {
      this.logger.error(`Cache cleanup failed: ${error.message}`);
    }
  }

  // Manual cleanup trigger
  async triggerCleanup(): Promise<{ removedCount: number; memoryStats: any }> {
    const removedCount = this.memoryStorage.cleanupExpiredCache();
    const memoryStats = this.memoryStorage.getMemoryStats();
    
    this.logger.log(`Manual cache cleanup triggered: ${removedCount} items removed`);
    
    return {
      removedCount,
      memoryStats,
    };
  }

  // Get cache statistics
  getCacheStatistics() {
    const memoryStats = this.memoryStorage.getMemoryStats();
    
    return {
      ...memoryStats,
      cleanupInterval: this.CLEANUP_INTERVAL_MS,
      lastCleanup: new Date(),
      schedulerActive: this.cleanupInterval !== null,
    };
  }
}