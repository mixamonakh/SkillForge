import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CompleteSessionDto, SessionListQueryDto, SessionPlanDto } from './sessions.dto.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  public constructor(private readonly sessions: SessionsService) {}

  @Get('recommendation')
  @ApiOperation({ summary: 'Одна primary recommendation из pure learning engine' })
  public recommendation(): Promise<unknown> {
    return this.sessions.recommendation();
  }

  @Post('plan')
  @ApiOperation({ summary: 'Проверить и нормализовать план сессии' })
  public plan(@Body() input: SessionPlanDto): Promise<SessionPlanDto> {
    return this.sessions.plan(input);
  }

  @Post()
  @ApiOperation({ summary: 'Создать session snapshot, items и attempts' })
  public create(@Body() input: SessionPlanDto): Promise<unknown> {
    return this.sessions.create(input);
  }

  @Get()
  public history(@Query() query: SessionListQueryDto): Promise<unknown[]> {
    return this.sessions.history(query);
  }

  @Get(':sessionId')
  public get(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.get(sessionId);
  }

  @Post(':sessionId/start')
  public start(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.start(sessionId);
  }

  @Post(':sessionId/pause')
  public pause(@Param('sessionId', ParseUUIDPipe) sessionId: string): Promise<unknown> {
    return this.sessions.pause(sessionId);
  }

  @Post(':sessionId/complete')
  public complete(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() input: CompleteSessionDto,
  ): Promise<unknown> {
    return this.sessions.complete(sessionId, input);
  }
}
