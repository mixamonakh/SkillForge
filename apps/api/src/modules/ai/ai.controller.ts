import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiObjectOk } from '../../common/openapi-response.js';
import { AiEvaluationService } from './ai-evaluation.service.js';
import { AiHintService } from './ai-hint.service.js';
import { AiUsageService } from './ai-usage.service.js';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  public constructor(
    private readonly evaluations: AiEvaluationService,
    private readonly hints: AiHintService,
    private readonly usage: AiUsageService,
  ) {}

  @Post('attempts/:attemptId/evaluate')
  @ApiOperation({ summary: 'Создать schema-validated AI evaluation draft и preview' })
  @ApiObjectOk('AI evaluation draft')
  public evaluate(@Param('attemptId', ParseUUIDPipe) attemptId: string): Promise<unknown> {
    return this.evaluations.evaluate(attemptId);
  }

  @Get('evaluations/:draftId')
  @ApiObjectOk('AI evaluation draft, preview и allowed actions')
  public get(@Param('draftId', ParseUUIDPipe) draftId: string): Promise<unknown> {
    return this.evaluations.get(draftId);
  }

  @Post('evaluations/:draftId/apply')
  @ApiOperation({ summary: 'Идемпотентно применить AI draft через обычные Evaluation/Evidence' })
  @ApiObjectOk('Applied AI evaluation draft')
  public apply(@Param('draftId', ParseUUIDPipe) draftId: string): Promise<unknown> {
    return this.evaluations.apply(draftId);
  }

  @Post('evaluations/:draftId/reject')
  @ApiOperation({ summary: 'Отклонить AI draft без knowledge-state mutation' })
  @ApiObjectOk('Rejected AI evaluation draft')
  public reject(@Param('draftId', ParseUUIDPipe) draftId: string): Promise<unknown> {
    return this.evaluations.reject(draftId);
  }

  @Post('evaluations/:draftId/rollback')
  @ApiOperation({ summary: 'Компенсировать applied AI evaluation без удаления данных' })
  @ApiObjectOk('Rolled-back AI evaluation draft')
  public rollback(@Param('draftId', ParseUUIDPipe) draftId: string): Promise<unknown> {
    return this.evaluations.rollback(draftId);
  }

  @Post('attempts/:attemptId/nudge')
  @ApiOperation({ summary: 'Получить и сохранить одну bounded AI-подсказку на Attempt' })
  @ApiObjectOk('Persisted one nudge')
  public nudge(@Param('attemptId', ParseUUIDPipe) attemptId: string): Promise<unknown> {
    return this.hints.nudge(attemptId);
  }

  @Get('usage/current')
  @ApiOperation({ summary: 'Текущий hard-budget ledger без answer bodies' })
  @ApiObjectOk('AI usage за текущий UTC month')
  public currentUsage(): Promise<unknown> {
    return this.usage.current();
  }
}
