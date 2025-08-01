import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorType } from '../enums/error-type.enum';

export class CustomException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly errorType: ErrorType,
    public readonly retry: boolean = false,
    public readonly retryAfter?: number,
    public readonly details?: any,
  ) {
    super(message, status);
  }
}

export class FileFormatException extends CustomException {
  constructor(message: string, details?: any) {
    super(message, HttpStatus.BAD_REQUEST, ErrorType.FILE_FORMAT_ERROR, false, undefined, details);
  }
}

export class ModelProcessingException extends CustomException {
  constructor(message: string, details?: any) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorType.MODEL_PROCESSING_ERROR, true, 30, details);
  }
}

export class AIServiceException extends CustomException {
  constructor(message: string, details?: any) {
    super(message, HttpStatus.SERVICE_UNAVAILABLE, ErrorType.AI_SERVICE_ERROR, true, 10, details);
  }
}

export class SystemException extends CustomException {
  constructor(message: string, details?: any) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorType.SYSTEM_ERROR, false, undefined, details);
  }
}

export class RateLimitException extends CustomException {
  constructor(message: string, retryAfter: number = 60) {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorType.RATE_LIMIT_ERROR, true, retryAfter);
  }
}