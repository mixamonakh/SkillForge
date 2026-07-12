import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ContentQueryDto, TopicQueryDto } from './curriculum.dto.js';
import { CurriculumService } from './curriculum.service.js';

@ApiTags('curriculum')
@Controller()
export class CurriculumController {
  public constructor(private readonly curriculum: CurriculumService) {}

  @Get('tracks')
  @ApiOperation({ summary: 'Список активных треков с coverage' })
  public tracks(): Promise<unknown[]> {
    return this.curriculum.tracks();
  }

  @Get('tracks/:trackKey')
  @ApiOperation({ summary: 'Детали трека' })
  public track(@Param('trackKey') trackKey: string): Promise<unknown> {
    return this.curriculum.track(trackKey);
  }

  @Get('topics')
  @ApiOperation({ summary: 'Карта тем из БД' })
  public topics(@Query() query: TopicQueryDto): Promise<unknown[]> {
    return this.curriculum.topics(query);
  }

  @Get('topics/:topicKey')
  @ApiOperation({ summary: 'Topic Detail с evidence и content' })
  public topic(@Param('topicKey') topicKey: string): Promise<unknown> {
    return this.curriculum.topic(topicKey);
  }

  @Get('topics/:topicKey/evidence')
  @ApiOperation({ summary: 'Evidence темы с provenance' })
  public evidence(@Param('topicKey') topicKey: string): Promise<unknown[]> {
    return this.curriculum.evidence(topicKey);
  }

  @Get('content')
  @ApiOperation({ summary: 'Read-only Content Library' })
  public content(@Query() query: ContentQueryDto): Promise<unknown> {
    return this.curriculum.content(query);
  }
}
