import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AutosaveAttemptDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public revision!: number;

  @ApiProperty({ nullable: true, maxLength: 250_000 })
  @IsOptional()
  @IsString()
  @MaxLength(250_000)
  public answerText?: string | null;

  @ApiProperty({ nullable: true, maxLength: 51_200 })
  @IsOptional()
  @IsString()
  @MaxLength(51_200)
  public answerCode?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  public selectedOptions!: string[];

  @ApiProperty({ nullable: true, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  public selfRating?: number | null;

  @ApiProperty({ nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  public confidence?: number | null;

  @ApiProperty({ enum: ['NONE', 'NUDGE', 'HINT', 'MULTIPLE_HINTS', 'SOLUTION_VIEWED'] })
  @IsIn(['NONE', 'NUDGE', 'HINT', 'MULTIPLE_HINTS', 'SOLUTION_VIEWED'])
  public helpLevel!: 'NONE' | 'NUDGE' | 'HINT' | 'MULTIPLE_HINTS' | 'SOLUTION_VIEWED';

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(1_000, { each: true })
  public hintsUsed!: string[];

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  public clientUpdatedAt!: string;
}

export class PersistRunnerResultDto {
  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  public revision!: number;

  @ApiProperty({ type: Object })
  @IsObject()
  public runnerResult!: object;
}
