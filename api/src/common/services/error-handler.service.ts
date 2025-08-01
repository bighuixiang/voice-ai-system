import { Injectable, Logger } from '@nestjs/common';
import { ErrorType } from '../enums/error-type.enum';
import { ErrorResponse, LoggedError } from '../interfaces/error-response.interface';
import { CustomException } from '../exceptions/custom.exceptions';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);
  private readonly errorLog: LoggedError[] = [];
  private readonly maxLogSize = 1000; // Keep last 1000 errors in memory

  handleError(error: Error, path: string, userId?: string, requestId?: string): ErrorResponse {
    const errorId = uuidv4();
    const timestamp = new Date().toISOString();

    // Log the error
    const loggedError: LoggedError = {
      id: errorId,
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      context: { path, userId, requestId },
      timestamp: new Date(),
      userId,
      requestId,
    };

    this.addToErrorLog(loggedError);

    // Handle different error types
    if (error instanceof CustomException) {
      return this.handleCustomException(error, path, timestamp, errorId);
    }

    // Handle built-in NestJS exceptions
    const errorType = this.classifyError(error);
    const errorResponse = this.createErrorResponse(error, errorType, path, timestamp, errorId);

    // Log based on severity
    if (errorResponse.code >= 500) {
      this.logger.error(`[${errorId}] ${error.message}`, error.stack);
    } else if (errorResponse.code >= 400) {
      this.logger.warn(`[${errorId}] ${error.message}`);
    } else {
      this.logger.log(`[${errorId}] ${error.message}`);
    }

    return errorResponse;
  }

  private handleCustomException(
    error: CustomException,
    path: string,
    timestamp: string,
    errorId: string,
  ): ErrorResponse {
    const response: ErrorResponse = {
      code: error.getStatus(),
      message: error.message,
      error: error.errorType,
      timestamp,
      path,
      retry: error.retry,
    };

    if (error.retryAfter) {
      response.retryAfter = error.retryAfter;
    }

    if (error.details) {
      response.details = error.details;
    }

    // Log based on error type
    if (error.errorType === ErrorType.SYSTEM_ERROR || error.errorType === ErrorType.MODEL_PROCESSING_ERROR) {
      this.logger.error(`[${errorId}] ${error.message}`, error.stack);
    } else {
      this.logger.warn(`[${errorId}] ${error.message}`);
    }

    return response;
  }

  private classifyError(error: Error): ErrorType {
    const errorName = error.constructor.name;
    const message = error.message.toLowerCase();

    // Classify based on error type and message
    if (errorName.includes('Validation') || message.includes('validation')) {
      return ErrorType.VALIDATION_ERROR;
    }

    if (errorName.includes('NotFound') || message.includes('not found')) {
      return ErrorType.NOT_FOUND_ERROR;
    }

    if (errorName.includes('Unauthorized') || message.includes('unauthorized')) {
      return ErrorType.UNAUTHORIZED_ERROR;
    }

    if (message.includes('file format') || message.includes('invalid format')) {
      return ErrorType.FILE_FORMAT_ERROR;
    }

    if (message.includes('ai service') || message.includes('model')) {
      return ErrorType.AI_SERVICE_ERROR;
    }

    return ErrorType.SYSTEM_ERROR;
  }

  private createErrorResponse(
    error: Error,
    errorType: ErrorType,
    path: string,
    timestamp: string,
    errorId: string,
  ): ErrorResponse {
    const baseResponse: ErrorResponse = {
      code: this.getStatusCodeForErrorType(errorType),
      message: this.getUserFriendlyMessage(error.message, errorType),
      error: errorType,
      timestamp,
      path,
    };

    // Add retry information based on error type
    switch (errorType) {
      case ErrorType.MODEL_PROCESSING_ERROR:
        baseResponse.retry = true;
        baseResponse.retryAfter = 30;
        break;
      case ErrorType.AI_SERVICE_ERROR:
        baseResponse.retry = true;
        baseResponse.retryAfter = 10;
        break;
      case ErrorType.RATE_LIMIT_ERROR:
        baseResponse.retry = true;
        baseResponse.retryAfter = 60;
        break;
      default:
        baseResponse.retry = false;
    }

    return baseResponse;
  }

  private getStatusCodeForErrorType(errorType: ErrorType): number {
    switch (errorType) {
      case ErrorType.VALIDATION_ERROR:
      case ErrorType.FILE_FORMAT_ERROR:
        return 400;
      case ErrorType.UNAUTHORIZED_ERROR:
        return 401;
      case ErrorType.NOT_FOUND_ERROR:
        return 404;
      case ErrorType.RATE_LIMIT_ERROR:
        return 429;
      case ErrorType.AI_SERVICE_ERROR:
        return 503;
      case ErrorType.MODEL_PROCESSING_ERROR:
      case ErrorType.SYSTEM_ERROR:
      default:
        return 500;
    }
  }

  private getUserFriendlyMessage(originalMessage: string, errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.VALIDATION_ERROR:
        return '请求参数验证失败，请检查输入数据';
      case ErrorType.FILE_FORMAT_ERROR:
        return '文件格式不支持，请上传正确格式的文件';
      case ErrorType.MODEL_PROCESSING_ERROR:
        return '模型处理失败，请稍后重试';
      case ErrorType.AI_SERVICE_ERROR:
        return 'AI服务暂时不可用，请稍后重试';
      case ErrorType.NOT_FOUND_ERROR:
        return '请求的资源不存在';
      case ErrorType.UNAUTHORIZED_ERROR:
        return '未授权访问';
      case ErrorType.RATE_LIMIT_ERROR:
        return '请求过于频繁，请稍后重试';
      case ErrorType.SYSTEM_ERROR:
      default:
        return '系统内部错误，请联系管理员';
    }
  }

  private addToErrorLog(error: LoggedError): void {
    this.errorLog.push(error);
    
    // Keep only the last maxLogSize errors
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<string, number>;
    recentErrors: LoggedError[];
  } {
    const errorsByType: Record<string, number> = {};
    
    this.errorLog.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
    });

    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      recentErrors: this.errorLog.slice(-10), // Last 10 errors
    };
  }

  getErrorById(errorId: string): LoggedError | undefined {
    return this.errorLog.find(error => error.id === errorId);
  }

  clearErrorLog(): void {
    this.errorLog.length = 0;
    this.logger.log('Error log cleared');
  }
}