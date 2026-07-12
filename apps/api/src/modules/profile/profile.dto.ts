import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'yandex-frontend-2026' })
  @IsOptional()
  @IsString()
  @Length(3, 160)
  public targetTrackKey?: string;

  @ApiPropertyOptional({ enum: ['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'] })
  @IsOptional()
  @IsIn(['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'])
  public defaultLoadMode?: 'MINIMAL' | 'NORMAL' | 'DEEP' | 'RETURN';

  @ApiPropertyOptional({ enum: ['javascript', 'typescript'] })
  @IsOptional()
  @IsIn(['javascript', 'typescript'])
  public codeLanguage?: 'javascript' | 'typescript';

  @ApiPropertyOptional({ enum: ['manual'], description: 'MVP работает только в manual mode.' })
  @IsOptional()
  @IsIn(['manual'])
  public aiMode?: 'manual';

  @ApiPropertyOptional({ example: 0, maximum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0)
  public apiMonthlyBudgetUsd?: number;

  @ApiPropertyOptional({ example: 7, minimum: 1, maximum: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  public resumeThresholdDays?: number;

  @ApiPropertyOptional({ enum: ['light'] })
  @IsOptional()
  @IsIn(['light'])
  public theme?: 'light';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  public reducedMotion?: boolean;
}

export class ResetConfirmDto {
  @ApiProperty({ example: 'СБРОСИТЬ ДАННЫЕ' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  public confirmation!: string;
}
