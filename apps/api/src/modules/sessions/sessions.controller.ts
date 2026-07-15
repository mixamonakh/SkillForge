import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiObjectArrayOk, ApiObjectOk } from '../../common/openapi-response.js';
import { CompleteSessionDto, SessionListQueryDto, SessionPlanDto } from './sessions.dto.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  public constructor(private readonly sessions: SessionsService) {}

  @Get('recommendation')
  @ApiOperation({ summary: 'Одна primary recommendation из pure learning engine' })
  @ApiObjectOk('Recommendation v2 с legacy topic/mode/load wrapper')
  public recommendation(): Promise<unknown> {
    return this.sessions.recommendation();
  }

  @Post('plan')
  @ApiOperation({ summary: 'Проверить и нормализовать план сессии' })
  public plan(@Body() input: SessionPlanDto): Promise<SessionPlanDto> {
    return this.sessions.plan(input);
  }

  @Post()
  @ApiOperation({ summary: 'Создать session snapshot, CONTENT/TASK steps и task attempts' })
  @ApiObjectOk('Learning session с ordered steps и legacy-compatible items')
  public create(@Body() input: SessionPlanDto): Promise<unknown> {
    return this.sessions.create(input);
  }

  @Get()
  @ApiObjectArrayOk('История learning sessions с LearningPhase')
  public history(@Query() query: SessionListQueryDto): Promise<unknown[]> {
    return this.sessions.history(query);
  }

  @Get(':sessionId')
  @ApiObjectOk('Learning session с ordered CONTENT/TASK steps и legacy-compatible items')
  public get(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.get(sessionId);
  }

  @Post(':sessionId/start')
  @ApiObjectOk('Запущенная или возобновлённая learning session')
  public start(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.start(sessionId);
  }

  @Post(':sessionId/pause')
  @ApiObjectOk('Learning session на паузе')
  public pause(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.pause(sessionId);
  }

  @Post(':sessionId/content-steps/:stepId/complete')
  @ApiOperation({ summary: 'Идемпотентно завершить CONTENT step активной сессии' })
  @ApiObjectOk('Завершённый CONTENT step из immutable session snapshot')
  public completeContentStep(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ): Promise<unknown> {
    return this.sessions.completeContentStep(sessionId, stepId);
  }

  @Post(':sessionId/complete')
  @ApiObjectOk('Завершённая learning session')
  public complete(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() input: CompleteSessionDto,
  ): Promise<unknown> {
    return this.sessions.complete(sessionId, input);
  }
}
