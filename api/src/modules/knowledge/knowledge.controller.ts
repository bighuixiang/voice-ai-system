import { 
  Controller, 
  Post, 
  Get, 
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors, 
  UploadedFile, 
  BadRequestException,
  NotFoundException 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Enhanced file validation
    const allowedExtensions = ['.txt', '.md'];
    const allowedMimeTypes = ['text/plain', 'text/markdown', 'application/octet-stream'];
    
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
    const hasValidExtension = allowedExtensions.includes(`.${fileExtension}`);
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
    
    if (!hasValidExtension && !hasValidMimeType) {
      throw new BadRequestException(
        `Unsupported file format. Only TXT and MD files are supported. ` +
        `Received: ${file.originalname} (${file.mimetype})`
      );
    }

    // Validate file size (additional check beyond multer limits)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum size is ${maxSize / 1024 / 1024}MB. ` +
        `Received: ${Math.round(file.size / 1024 / 1024 * 100) / 100}MB`
      );
    }

    // Validate file content is not empty
    if (file.size === 0) {
      throw new BadRequestException('File is empty');
    }

    try {
      return await this.knowledgeService.uploadDocument(file);
    } catch (error) {
      throw new BadRequestException(`Document upload failed: ${error.message}`);
    }
  }

  @Get('search')
  async searchKnowledge(@Query('query') query: string, @Query('limit') limit?: string) {
    if (!query) {
      throw new BadRequestException('Query parameter is required');
    }
    
    const searchLimit = limit ? parseInt(limit, 10) : 5;
    if (isNaN(searchLimit) || searchLimit < 1 || searchLimit > 20) {
      throw new BadRequestException('Limit must be a number between 1 and 20');
    }
    
    return this.knowledgeService.searchKnowledge(query, searchLimit);
  }

  @Post('search/advanced')
  async advancedSearch(@Body() searchOptions: {
    query: string;
    limit?: number;
    minRelevanceScore?: number;
    includeMetadata?: boolean;
  }) {
    if (!searchOptions.query) {
      throw new BadRequestException('Query is required');
    }

    // Validate limit
    if (searchOptions.limit && (searchOptions.limit < 1 || searchOptions.limit > 50)) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }

    // Validate relevance score
    if (searchOptions.minRelevanceScore && (searchOptions.minRelevanceScore < 0 || searchOptions.minRelevanceScore > 1)) {
      throw new BadRequestException('Minimum relevance score must be between 0 and 1');
    }

    return this.knowledgeService.advancedSearch(searchOptions);
  }

  @Get('search/suggestions')
  async getSearchSuggestions(@Query('prefix') prefix: string, @Query('limit') limit?: string) {
    if (!prefix) {
      throw new BadRequestException('Prefix parameter is required');
    }

    if (prefix.length < 2) {
      throw new BadRequestException('Prefix must be at least 2 characters long');
    }
    
    const suggestionLimit = limit ? parseInt(limit, 10) : 5;
    if (isNaN(suggestionLimit) || suggestionLimit < 1 || suggestionLimit > 10) {
      throw new BadRequestException('Limit must be a number between 1 and 10');
    }
    
    return this.knowledgeService.getSearchSuggestions(prefix, suggestionLimit);
  }

  @Get('search/stats')
  async getSearchStats() {
    return this.knowledgeService.getSearchStats();
  }

  @Delete('search/history')
  async clearSearchHistory() {
    return this.knowledgeService.clearSearchHistory();
  }

  @Get('stats')
  async getKnowledgeStats() {
    return this.knowledgeService.getKnowledgeStats();
  }

  @Get('export')
  async exportKnowledge() {
    return this.knowledgeService.exportKnowledge();
  }

  @Post('import')
  async importKnowledge(@Body() importData: any) {
    if (!importData) {
      throw new BadRequestException('Import data is required');
    }
    return this.knowledgeService.importKnowledge(importData);
  }

  @Post('reload')
  async reloadKnowledge() {
    return this.knowledgeService.reloadKnowledge();
  }

  @Get(':id')
  async getDocument(@Param('id') id: string) {
    const result = await this.knowledgeService.getDocument(id);
    if (!result.success) {
      throw new NotFoundException(result.message);
    }
    return result;
  }

  @Delete(':id')
  async deleteDocument(@Param('id') id: string) {
    const result = await this.knowledgeService.deleteDocument(id);
    if (!result.success) {
      throw new NotFoundException(result.message);
    }
    return result;
  }

  @Get()
  async getDocuments() {
    return this.knowledgeService.getDocuments();
  }
}