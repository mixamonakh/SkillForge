import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TopicQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public track?: string;

  @ApiPropertyOptional({ enum: ['UNKNOWN', 'WEAK', 'UNSTABLE', 'SOLID', 'MASTERED'] })
  @IsOptional()
  @IsIn(['UNKNOWN', 'WEAK', 'UNSTABLE', 'SOLID', 'MASTERED'])
  public status?: 'UNKNOWN' | 'WEAK' | 'UNSTABLE' | 'SOLID' | 'MASTERED';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  public reviewDue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public search?: string;
}

export class ContentQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public topicKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['THEORY', 'LINK', 'CHECKLIST', 'TASK', 'ASSESSMENT', ''])
  public kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  public cursor?: string;

  @ApiPropertyOptional({ default: 60, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;
}
