import { Controller, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { ErrorHandlerService } from '../services/error-handler.service';

// Simple admin guard - in production, implement proper authentication
// @UseGuards(AdminGuard)
@Controller('api/admin/errors')
export class ErrorMonitoringController {
  constructor(private readonly errorHandlerService: ErrorHandlerService) {}

  @Get('stats')
  getErrorStats() {
    return this.errorHandlerService.getErrorStats();
  }

  @Get(':errorId')
  getErrorById(@Param('errorId') errorId: string) {
    const error = this.errorHandlerService.getErrorById(errorId);
    if (!error) {
      return { message: 'Error not found' };
    }
    return error;
  }

  @Delete('log')
  clearErrorLog() {
    this.errorHandlerService.clearErrorLog();
    return { message: 'Error log cleared successfully' };
  }
}