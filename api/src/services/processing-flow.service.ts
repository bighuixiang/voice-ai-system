import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AIClientService } from './ai-client.service';
import { TextProcessingService } from './text-processing.service';
import { CacheService } from '../modules/cache/cache.service';

export enum ProcessingStage {
  VALIDATION = 'validation',
  PREPROCESSING = 'preprocessing',
  AI_PROCESSING = 'ai_processing',
  POSTPROCESSING = 'postprocessing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ProcessingProgress {
  id: string;
  stage: ProcessingStage;
  progress: number; // 0-100
  message: string;
  startTime: Date;
  currentStageStartTime: Date;
  estimatedTimeRemaining?: number;
  error?: string;
}

export interface ProcessingFlowResult {
  id: string;
  success: boolean;
  transcription?: string;
  understanding: {
    intent: string;
    entities: any[];
    confidence: number;
  };
  actions: any[];
  processingTime: number;
  timestamp: Date;
  stages: {
    stage: ProcessingStage;
    duration: number;
    success: boolean;
    error?: string;
  }[];
  textProcessing?: {
    originalText: string;
    processedText: string;
    metadata: any;
  };
  error?: string;
}

@Injectable()
export class ProcessingFlowService {
  private readonly logger = new Logger(ProcessingFlowService.name);
  private readonly processingTasks = new Map<string, ProcessingProgress>();

  constructor(
    private readonly aiClientService: AIClientService,
    private readonly textProcessingService: TextProcessingService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Process voice input with complete flow management
   */
  async processVoiceFlow(
    file: Express.Multer.File,
    trackProgress: boolean = false,
  ): Promise<ProcessingFlowResult> {
    const processingId = this.generateProcessingId();
    const startTime = new Date();
    const stages: ProcessingFlowResult['stages'] = [];

    try {
      // Initialize progress tracking
      if (trackProgress) {
        this.initializeProgress(processingId, 'voice', startTime);
      }

      // Stage 1: Validation
      const validationStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.VALIDATION, 10, 'Validating audio file...');
      
      if (!file || !file.buffer) {
        throw new BadRequestException('Invalid audio file');
      }

      stages.push({
        stage: ProcessingStage.VALIDATION,
        duration: Date.now() - validationStart,
        success: true,
      });

      // Stage 2: Preprocessing
      const preprocessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.PREPROCESSING, 30, 'Preparing audio for processing...');
      
      // Audio preprocessing could be added here if needed
      const audioMetadata = {
        filename: file.originalname,
        format: file.mimetype,
        size: file.size,
      };

      stages.push({
        stage: ProcessingStage.PREPROCESSING,
        duration: Date.now() - preprocessingStart,
        success: true,
      });

      // Stage 3: AI Processing
      const aiProcessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.AI_PROCESSING, 70, 'Processing with AI models...');
      
      const aiResult = await this.aiClientService.processVoice(file.buffer, audioMetadata);

      stages.push({
        stage: ProcessingStage.AI_PROCESSING,
        duration: Date.now() - aiProcessingStart,
        success: true,
      });

      // Stage 4: Postprocessing
      const postprocessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.POSTPROCESSING, 90, 'Finalizing results...');
      
      // Cache the result for potential future reference
      if (trackProgress) {
        this.cacheService.setCache(`processing_result_${processingId}`, aiResult, 3600); // 1 hour
      }

      stages.push({
        stage: ProcessingStage.POSTPROCESSING,
        duration: Date.now() - postprocessingStart,
        success: true,
      });

      // Complete
      this.updateProgress(processingId, ProcessingStage.COMPLETED, 100, 'Processing completed successfully');

      const totalProcessingTime = Date.now() - startTime.getTime();

      const result: ProcessingFlowResult = {
        id: processingId,
        success: true,
        transcription: aiResult.transcription,
        understanding: aiResult.understanding,
        actions: aiResult.actions || [],
        processingTime: totalProcessingTime,
        timestamp: new Date(),
        stages,
      };

      this.logger.log(`Voice processing completed for ${processingId} in ${totalProcessingTime}ms`);
      return result;

    } catch (error) {
      this.logger.error(`Voice processing failed for ${processingId}: ${error.message}`);
      
      this.updateProgress(processingId, ProcessingStage.FAILED, 0, `Processing failed: ${error.message}`);
      
      stages.push({
        stage: ProcessingStage.FAILED,
        duration: Date.now() - startTime.getTime(),
        success: false,
        error: error.message,
      });

      return {
        id: processingId,
        success: false,
        understanding: {
          intent: '',
          entities: [],
          confidence: 0,
        },
        actions: [],
        processingTime: Date.now() - startTime.getTime(),
        timestamp: new Date(),
        stages,
        error: error.message,
      };
    } finally {
      // Clean up progress tracking after a delay
      setTimeout(() => {
        this.processingTasks.delete(processingId);
      }, 300000); // 5 minutes
    }
  }

  /**
   * Process text input with complete flow management
   */
  async processTextFlow(
    content: string,
    trackProgress: boolean = false,
  ): Promise<ProcessingFlowResult> {
    const processingId = this.generateProcessingId();
    const startTime = new Date();
    const stages: ProcessingFlowResult['stages'] = [];

    try {
      // Initialize progress tracking
      if (trackProgress) {
        this.initializeProgress(processingId, 'text', startTime);
      }

      // Stage 1: Validation
      const validationStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.VALIDATION, 15, 'Validating text input...');
      
      const validation = this.textProcessingService.validateTextInput(content);
      if (!validation.isValid) {
        throw new BadRequestException(validation.error);
      }

      stages.push({
        stage: ProcessingStage.VALIDATION,
        duration: Date.now() - validationStart,
        success: true,
      });

      // Stage 2: Preprocessing
      const preprocessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.PREPROCESSING, 35, 'Processing and sanitizing text...');
      
      const textProcessing = await this.textProcessingService.processText(content);
      
      if (textProcessing.metadata.containsUnsafeContent) {
        throw new BadRequestException('Text contains unsafe or inappropriate content');
      }

      stages.push({
        stage: ProcessingStage.PREPROCESSING,
        duration: Date.now() - preprocessingStart,
        success: true,
      });

      // Stage 3: AI Processing
      const aiProcessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.AI_PROCESSING, 75, 'Processing with AI models...');
      
      const aiResult = await this.aiClientService.processText(textProcessing.processedText);

      stages.push({
        stage: ProcessingStage.AI_PROCESSING,
        duration: Date.now() - aiProcessingStart,
        success: true,
      });

      // Stage 4: Postprocessing
      const postprocessingStart = Date.now();
      this.updateProgress(processingId, ProcessingStage.POSTPROCESSING, 95, 'Finalizing results...');
      
      // Cache the result for potential future reference
      if (trackProgress) {
        this.cacheService.setCache(`processing_result_${processingId}`, aiResult, 3600); // 1 hour
      }

      stages.push({
        stage: ProcessingStage.POSTPROCESSING,
        duration: Date.now() - postprocessingStart,
        success: true,
      });

      // Complete
      this.updateProgress(processingId, ProcessingStage.COMPLETED, 100, 'Processing completed successfully');

      const totalProcessingTime = Date.now() - startTime.getTime();

      const result: ProcessingFlowResult = {
        id: processingId,
        success: true,
        understanding: aiResult.understanding,
        actions: aiResult.actions || [],
        processingTime: totalProcessingTime,
        timestamp: new Date(),
        stages,
        textProcessing: {
          originalText: textProcessing.originalText,
          processedText: textProcessing.processedText,
          metadata: textProcessing.metadata,
        },
      };

      this.logger.log(`Text processing completed for ${processingId} in ${totalProcessingTime}ms`);
      return result;

    } catch (error) {
      this.logger.error(`Text processing failed for ${processingId}: ${error.message}`);
      
      this.updateProgress(processingId, ProcessingStage.FAILED, 0, `Processing failed: ${error.message}`);
      
      stages.push({
        stage: ProcessingStage.FAILED,
        duration: Date.now() - startTime.getTime(),
        success: false,
        error: error.message,
      });

      return {
        id: processingId,
        success: false,
        understanding: {
          intent: '',
          entities: [],
          confidence: 0,
        },
        actions: [],
        processingTime: Date.now() - startTime.getTime(),
        timestamp: new Date(),
        stages,
        textProcessing: {
          originalText: content,
          processedText: content,
          metadata: { containsUnsafeContent: false },
        },
        error: error.message,
      };
    } finally {
      // Clean up progress tracking after a delay
      setTimeout(() => {
        this.processingTasks.delete(processingId);
      }, 300000); // 5 minutes
    }
  }

  /**
   * Get processing progress by ID
   */
  getProcessingProgress(processingId: string): ProcessingProgress | null {
    return this.processingTasks.get(processingId) || null;
  }

  /**
   * Get all active processing tasks
   */
  getActiveProcessingTasks(): ProcessingProgress[] {
    return Array.from(this.processingTasks.values());
  }

  /**
   * Initialize progress tracking
   */
  private initializeProgress(
    processingId: string,
    type: 'voice' | 'text',
    startTime: Date,
  ): void {
    const progress: ProcessingProgress = {
      id: processingId,
      stage: ProcessingStage.VALIDATION,
      progress: 0,
      message: `Starting ${type} processing...`,
      startTime,
      currentStageStartTime: startTime,
    };

    this.processingTasks.set(processingId, progress);
  }

  /**
   * Update processing progress
   */
  private updateProgress(
    processingId: string,
    stage: ProcessingStage,
    progress: number,
    message: string,
  ): void {
    const existingProgress = this.processingTasks.get(processingId);
    if (!existingProgress) return;

    const now = new Date();
    const totalElapsed = now.getTime() - existingProgress.startTime.getTime();
    const estimatedTotal = progress > 0 ? (totalElapsed / progress) * 100 : 0;
    const estimatedTimeRemaining = Math.max(0, estimatedTotal - totalElapsed);

    const updatedProgress: ProcessingProgress = {
      ...existingProgress,
      stage,
      progress,
      message,
      currentStageStartTime: stage !== existingProgress.stage ? now : existingProgress.currentStageStartTime,
      estimatedTimeRemaining: estimatedTimeRemaining > 0 ? estimatedTimeRemaining : undefined,
    };

    this.processingTasks.set(processingId, updatedProgress);
  }

  /**
   * Generate unique processing ID
   */
  private generateProcessingId(): string {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}