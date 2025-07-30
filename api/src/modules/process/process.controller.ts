import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcessService } from './process.service';
import { ProcessTextDto } from './dto/process-text.dto';
import { FileValidationService } from '../../services/file-validation.service';
import { TempFileService } from '../../services/temp-file.service';

@Controller('api/process')
export class ProcessController {
  constructor(
    private readonly processService: ProcessService,
    private readonly fileValidation: FileValidationService,
    private readonly tempFileService: TempFileService,
  ) {}

  @Post('voice')
  @UseInterceptors(FileInterceptor('file'))
  async processVoice(
    @UploadedFile() file: Express.Multer.File,
    @Query('trackProgress') trackProgress?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate audio file
    const validation = this.fileValidation.validateAudioFile(file);
    if (!validation.isValid) {
      throw new BadRequestException(validation.error);
    }

    // Save as temporary file for processing
    const tempFile = await this.tempFileService.saveTempFile(file, 10 * 60 * 1000); // 10 minutes TTL

    try {
      const shouldTrackProgress = trackProgress === 'true';
      const result = await this.processService.processVoice(file, shouldTrackProgress);
      
      // Clean up temp file after successful processing
      this.tempFileService.deleteTempFile(tempFile.id);
      
      return {
        ...result,
        fileInfo: validation.fileInfo,
      };
    } catch (error) {
      // Clean up temp file on error
      this.tempFileService.deleteTempFile(tempFile.id);
      throw error;
    }
  }

  @Post('text')
  async processText(
    @Body() processTextDto: ProcessTextDto,
    @Query('trackProgress') trackProgress?: string,
  ) {
    const shouldTrackProgress = trackProgress === 'true';
    return this.processService.processText(processTextDto, shouldTrackProgress);
  }

  @Get('temp-files/stats')
  async getTempFileStats() {
    return this.tempFileService.getTempFileStats();
  }

  @Get('temp-files/:fileId')
  async getTempFileInfo(@Param('fileId') fileId: string) {
    const tempFile = this.tempFileService.getTempFile(fileId);
    
    if (!tempFile) {
      throw new NotFoundException('Temporary file not found or expired');
    }

    return {
      id: tempFile.id,
      originalName: tempFile.originalName,
      size: tempFile.size,
      createdAt: tempFile.createdAt,
      expiresAt: tempFile.expiresAt,
    };
  }

  @Get('progress/:processingId')
  async getProcessingProgress(@Param('processingId') processingId: string) {
    const progress = this.processService.getProcessingProgress(processingId);
    
    if (!progress) {
      throw new NotFoundException('Processing task not found or completed');
    }

    return progress;
  }

  @Get('progress')
  async getActiveProcessingTasks() {
    return {
      activeTasks: this.processService.getActiveProcessingTasks(),
      totalActive: this.processService.getActiveProcessingTasks().length,
    };
  }
}