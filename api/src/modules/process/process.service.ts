import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AIClientService } from '../../services/ai-client.service';
import { TextProcessingService } from '../../services/text-processing.service';
import { ProcessingFlowService, ProcessingFlowResult } from '../../services/processing-flow.service';
import { ProcessTextDto } from './dto/process-text.dto';

export interface ProcessResult {
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
  error?: string;
  textProcessing?: {
    originalText: string;
    processedText: string;
    metadata: any;
  };
}

@Injectable()
export class ProcessService {
  private readonly logger = new Logger(ProcessService.name);

  constructor(
    private readonly aiClientService: AIClientService,
    private readonly textProcessingService: TextProcessingService,
    private readonly processingFlowService: ProcessingFlowService,
  ) {}

  async processVoice(file: Express.Multer.File, trackProgress: boolean = false): Promise<ProcessResult> {
    this.logger.log(`Processing voice file: ${file.originalname} (progress tracking: ${trackProgress})`);
    
    const flowResult = await this.processingFlowService.processVoiceFlow(file, trackProgress);
    
    return this.convertFlowResultToProcessResult(flowResult);
  }

  async processText(processTextDto: ProcessTextDto, trackProgress: boolean = false): Promise<ProcessResult> {
    this.logger.log(`Processing text input (progress tracking: ${trackProgress})`);
    
    const flowResult = await this.processingFlowService.processTextFlow(processTextDto.content, trackProgress);
    
    return this.convertFlowResultToProcessResult(flowResult);
  }

  // Overloaded method for backward compatibility
  async processTextString(content: string): Promise<ProcessResult> {
    return this.processText({ content });
  }

  /**
   * Get processing progress by ID
   */
  getProcessingProgress(processingId: string) {
    return this.processingFlowService.getProcessingProgress(processingId);
  }

  /**
   * Get all active processing tasks
   */
  getActiveProcessingTasks() {
    return this.processingFlowService.getActiveProcessingTasks();
  }

  /**
   * Convert ProcessingFlowResult to ProcessResult for backward compatibility
   */
  private convertFlowResultToProcessResult(flowResult: ProcessingFlowResult): ProcessResult {
    return {
      success: flowResult.success,
      transcription: flowResult.transcription,
      understanding: flowResult.understanding,
      actions: flowResult.actions,
      processingTime: flowResult.processingTime,
      timestamp: flowResult.timestamp,
      error: flowResult.error,
      textProcessing: flowResult.textProcessing,
    };
  }
}