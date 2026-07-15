import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SessionPlanDto {
  @ApiProperty({ enum: ['TRAINING', 'REVIEW', 'INTERVIEW', 'RETURN', 'BATTLE'] })
  @IsIn(['TRAINING', 'REVIEW', 'INTERVIEW', 'RETURN', 'BATTLE'])
  public mode!: 'TRAINING' | 'REVIEW' | 'INTERVIEW' | 'RETURN' | 'BATTLE';

  @ApiProperty({ enum: ['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'] })
  @IsIn(['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'])
  public loadMode!: 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN';

  @ApiProperty({ type: [String], maxItems: 3 })
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  public topicKeys!: string[];

  @ApiProperty()
  @IsBoolean()
  public documentationAllowed!: boolean;

  @ApiProperty({ enum: ['javascript', 'typescript'] })
  @IsIn(['javascript', 'typescript'])
  public codeLanguage!: 'javascript' | 'typescript';

  @ApiPropertyOptional({ enum: ['ACQUISITION', 'CONSOLIDATION', 'TRANSFER'] })
  @IsOptional()
  @IsIn(['ACQUISITION', 'CONSOLIDATION', 'TRANSFER'])
  public learningPhase?: 'ACQUISITION' | 'CONSOLIDATION' | 'TRANSFER';

  @ApiPropertyOptional({ maxLength: 160, pattern: '^[a-z0-9]+(?:[.-][a-z0-9]+)*$' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
  public sequenceKey?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  public sequenceVersion?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (input: SessionPlanDto) =>
      input.returnFromSessionId !== undefined ||
      (Array.isArray(input.topicKeys) && input.topicKeys.length === 0),
  )
  @IsUUID()
  public returnFromSessionId?: string;
}

export class CompleteSessionDto {
  @ApiProperty({ enum: ['EASY', 'RIGHT', 'HARD', 'OVERLOAD'] })
  @IsIn(['EASY', 'RIGHT', 'HARD', 'OVERLOAD'])
  public loadFeedback!: 'EASY' | 'RIGHT' | 'HARD' | 'OVERLOAD';

  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  public summary?: string;
}

export class SessionListQueryDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'])
  public status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  public cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  public limit?: number;
}
