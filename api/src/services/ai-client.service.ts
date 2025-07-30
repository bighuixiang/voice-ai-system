import { Injectable, Logger, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent } from 'http';

export interface AIProcessingResult {
  transcription?: string;
  understanding: {
    intent: string;
    entities: any[];
    confidence: number;
  };
  actions: any[];
  processingTime?: number;
  timestamp?: Date;
}

export interface ProcessingRequest {
  type: 'voice' | 'text';
  content: string | Buffer;
  metadata?: {
    filename?: string;
    format?: string;
  };
}

export interface AIServiceResponse {
  success: boolean;
  data?: AIProcessingResult;
  error?: string;
  processingTime: number;
  timestamp: string;
}

@Injectable()
export class AIClientService {
  private readonly logger = new Logger(AIClientService.name);
  private readonly aiServiceUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly httpAgent: Agent;

  constructor(private readonly configService: ConfigService) {
    this.aiServiceUrl = this.configService.get('AI_SERVICE_URL') || 'http://localhost:8000';
    this.timeout = parseInt(this.configService.get('AI_SERVICE_TIMEOUT') || '30000');
    this.maxRetries = parseInt(this.configService.get('AI_SERVICE_MAX_RETRIES') || '3');
    this.retryDelay = parseInt(this.configService.get('AI_SERVICE_RETRY_DELAY') || '1000');
    
    // Configure HTTP agent with connection pooling
    this.httpAgent = new Agent({
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: this.timeout,
    });
  }

  /**
   * Process voice input with retry logic and proper error handling
   */
  async processVoice(audioBuffer: Buffer, metadata: { filename: string; format: string }): Promise<AIProcessingResult> {
    const request: ProcessingRequest = {
      type: 'voice',
      content: audioBuffer,
      metadata,
    };

    return this.executeWithRetry(async () => {
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: metadata.format });
      formData.append('file', blob, metadata.filename);

      const response = await this.makeRequest(`${this.aiServiceUrl}/api/process/voice`, {
        method: 'POST',
        body: formData,
      });

      return this.deserializeResponse(response);
    }, 'voice processing');
  }

  /**
   * Process text input with retry logic and proper error handling
   */
  async processText(content: string): Promise<AIProcessingResult> {
    const request: ProcessingRequest = {
      type: 'text',
      content,
    };

    return this.executeWithRetry(async () => {
      const serializedRequest = this.serializeRequest(request);
      
      const response = await this.makeRequest(`${this.aiServiceUrl}/api/process/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: serializedRequest,
      });

      return this.deserializeResponse(response);
    }, 'text processing');
  }

  /**
   * Health check with timeout handling
   */
  async ping(): Promise<{ status: string; timestamp: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.aiServiceUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`AI service health check failed with status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      this.logger.error(`AI service ping failed: ${error.message}`);
      throw new ServiceUnavailableException('AI service is not available');
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationType: string,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.debug(`Attempting ${operationType} (attempt ${attempt}/${this.maxRetries})`);
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`${operationType} attempt ${attempt} failed: ${error.message}`);

        if (attempt === this.maxRetries) {
          break;
        }

        // Don't retry on client errors (4xx)
        if (error.message.includes('400') || error.message.includes('401') || error.message.includes('403')) {
          throw new BadRequestException(`${operationType} failed: ${error.message}`);
        }

        // Wait before retrying
        await this.delay(this.retryDelay * attempt);
      }
    }

    this.logger.error(`${operationType} failed after ${this.maxRetries} attempts: ${lastError.message}`);
    throw new ServiceUnavailableException(`AI service is temporarily unavailable: ${lastError.message}`);
  }

  /**
   * Make HTTP request with timeout and connection pooling
   */
  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Serialize request data
   */
  private serializeRequest(request: ProcessingRequest): string {
    try {
      return JSON.stringify({
        type: request.type,
        content: request.content,
        metadata: request.metadata,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Request serialization failed: ${error.message}`);
      throw new BadRequestException('Failed to serialize request data');
    }
  }

  /**
   * Deserialize response data
   */
  private async deserializeResponse(response: Response): Promise<AIProcessingResult> {
    try {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI service responded with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response format from AI service');
      }

      // Ensure required fields are present
      const result: AIProcessingResult = {
        understanding: data.understanding || {
          intent: '',
          entities: [],
          confidence: 0,
        },
        actions: data.actions || [],
        transcription: data.transcription,
        processingTime: data.processingTime,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      };

      return result;
    } catch (error) {
      this.logger.error(`Response deserialization failed: ${error.message}`);
      throw new ServiceUnavailableException('Failed to process AI service response');
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}