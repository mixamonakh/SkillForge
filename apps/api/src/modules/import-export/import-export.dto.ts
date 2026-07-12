import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateExportDto {
  @ApiProperty({ enum: ['assessment-run', 'session', 'topic', 'profile', 'pending-review'] })
  @IsIn(['assessment-run', 'session', 'topic', 'profile', 'pending-review'])
  public bundleType!: 'assessment-run' | 'session' | 'topic' | 'profile' | 'pending-review';

  @ApiProperty({ type: Object })
  @IsObject()
  public scope!: Record<string, unknown>;
}

export class ValidateImportDto {
  @ApiProperty({ description: 'Raw или один fenced JSON block', maxLength: 5_242_880 })
  @IsString()
  @MaxLength(5_242_880)
  public payload!: string;

  @ApiProperty({ example: 'paste' })
  @IsString()
  @MaxLength(100)
  public source!: string;
}

export class DownloadQueryDto {
  @ApiPropertyOptional({ enum: ['json', 'markdown'], default: 'json' })
  @IsOptional()
  @IsIn(['json', 'markdown'])
  public format?: 'json' | 'markdown';
}
