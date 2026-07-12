import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';

function emptyToNull({ value }: { value: unknown }): unknown {
  return value === '' ? null : value;
}

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimStringArray({ value }: { value: unknown }): unknown {
  return Array.isArray(value)
    ? (value as unknown[]).map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;
}

export class ExternalArtifactPayloadDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 18 })
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(160, { each: true })
  public topicKeys!: string[];

  @ApiPropertyOptional({ maxLength: 100_000 })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  public codeDiff?: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  public checked?: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Сохранённый внешний analysis JSON; сам по себе не создаёт evidence',
  })
  @IsOptional()
  @IsObject()
  public externalAnalysis?: Record<string, unknown>;
}

export class CreateExternalArtifactDto {
  @ApiProperty({ maxLength: 240 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  public title!: string;

  @ApiProperty({ enum: ['PROJECT', 'GITHUB', 'LEETCODE', 'WORK'] })
  @IsIn(['PROJECT', 'GITHUB', 'LEETCODE', 'WORK'])
  public sourceType!: 'PROJECT' | 'GITHUB' | 'LEETCODE' | 'WORK';

  @ApiPropertyOptional({ maxLength: 240 })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(240)
  public projectName?: string | null;

  @ApiPropertyOptional({ format: 'uri' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2_048)
  public repositoryUrl?: string | null;

  @ApiPropertyOptional({ format: 'uri' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2_048)
  public resultUrl?: string | null;

  @ApiProperty({ maxLength: 20_000 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  public description!: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 50 })
  @Transform(trimStringArray)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(2_000, { each: true })
  public acceptanceCriteria!: string[];

  @ApiPropertyOptional({ maxLength: 50_000 })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  public beforeNotes?: string | null;

  @ApiPropertyOptional({ maxLength: 50_000 })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  public afterNotes?: string | null;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  public aiUsageNotes?: string | null;

  @ApiProperty({ type: ExternalArtifactPayloadDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ExternalArtifactPayloadDto)
  public payload!: ExternalArtifactPayloadDto;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  public occurredAt!: string;
}

export class UpdateExternalArtifactDto extends PartialType(CreateExternalArtifactDto) {}

export class ConfirmExternalEvidenceDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  @Equals(true)
  public confirmed!: true;
}
