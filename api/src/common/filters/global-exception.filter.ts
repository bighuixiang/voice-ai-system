import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorHandlerService } from '../services/error-handler.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly errorHandlerService: ErrorHandlerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract user and request information
    const userId = (request as any).user?.id;
    const requestId = request.headers['x-request-id'] as string;

    let error: Error;
    let status: HttpStatus;

    if (exception instanceof HttpException) {
      error = exception;
      status = exception.getStatus();
    } else if (exception instanceof Error) {
      error = exception;
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    } else {
      error = new Error('Unknown error occurred');
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    // Use error handler service to process the error
    const errorResponse = this.errorHandlerService.handleError(
      error,
      request.url,
      userId,
      requestId,
    );

    // Add request information to response
    const responseBody = {
      ...errorResponse,
      method: request.method,
      userAgent: request.headers['user-agent'],
    };

    // Set retry headers if applicable
    if (errorResponse.retry && errorResponse.retryAfter) {
      response.setHeader('Retry-After', errorResponse.retryAfter.toString());
    }

    // Set CORS headers if needed
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    response.status(errorResponse.code).json(responseBody);
  }
}