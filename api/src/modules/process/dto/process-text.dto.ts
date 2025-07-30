import { IsString, IsNotEmpty, MaxLength, MinLength, IsOptional } from 'class-validator';

export class ProcessTextDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Text content must be at least 3 characters long' })
  @MaxLength(10000, { message: 'Text content is too long (max 10,000 characters)' })
  content: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  context?: string;
}