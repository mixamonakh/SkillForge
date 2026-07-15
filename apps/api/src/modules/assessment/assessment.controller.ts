import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiObjectArrayOk, ApiObjectOk } from '../../common/openapi-response.js';
import { AssessmentService } from './assessment.service.js';
import { AutosaveAttemptDto, PersistRunnerResultDto } from './assessment.dto.js';

@ApiTags('assessment')
@Controller()
export class AssessmentController {
  public constructor(private readonly assessment: AssessmentService) {}

  @Get('assessments')
  @ApiOperation({ summary: 'Каталог versioned assessment blueprints' })
  @ApiObjectArrayOk('Каталог assessment blueprints')
  public catalog(): Promise<unknown[]> {
    return this.assessment.catalog();
  }

  @Get('assessments/:key')
  @ApiOperation({ summary: 'Описание assessment blueprint' })
  @ApiObjectOk('Описание assessment blueprint')
  public getAssessment(@Param('key') key: string): Promise<unknown> {
    return this.assessment.assessment(key);
  }

  @Post('assessments/prebaseline/start')
  @ApiOperation({ summary: 'Начать или продолжить adaptive JavaScript pre-baseline' })
  @ApiObjectOk('Adaptive pre-baseline с текущим item или stop decision')
  public startPrebaseline(): Promise<unknown> {
    return this.assessment.startPrebaseline();
  }

  @Post('assessments/:runId/next')
  @ApiOperation({ summary: 'Идемпотентно получить следующий pre-baseline item или stop decision' })
  @ApiObjectOk('Adaptive routing decision')
  public nextPrebaseline(
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<unknown> {
    return this.assessment.nextPrebaseline(runId);
  }

  @Get('assessments/:runId/routing-profile')
  @ApiOperation({ summary: 'RoutingProfile без mastery/pass-fail verdict' })
  @ApiObjectOk('Strict pre-baseline RoutingProfile')
  public prebaselineRoutingProfile(
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<unknown> {
    return this.assessment.prebaselineRoutingProfile(runId);
  }

  @Post('assessments/:key/runs')
  @ApiOperation({ summary: 'Создать durable assessment snapshot и linked session' })
  @ApiObjectOk('Assessment run с immutable snapshot')
  public createRun(@Param('key') key: string): Promise<unknown> {
    return this.assessment.createRun(key);
  }

  @Get('assessment-runs/:runId')
  @ApiObjectOk('Assessment run и сохранённые attempts')
  public getRun(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.run(runId);
  }

  @Post('assessment-runs/:runId/start')
  @ApiObjectOk('Запущенный assessment run')
  public start(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.start(runId);
  }

  @Post('assessment-runs/:runId/pause')
  @ApiObjectOk('Assessment run на паузе')
  public pause(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.pause(runId);
  }

  @Post('assessment-runs/:runId/resume')
  @ApiObjectOk('Возобновлённый assessment run')
  public resume(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.resume(runId);
  }

  @Post('assessment-runs/:runId/complete-block')
  @ApiObjectOk('Assessment run на следующем блоке')
  public completeBlock(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.completeBlock(runId);
  }

  @Post('assessment-runs/:runId/complete')
  @ApiObjectOk('Завершённый assessment run')
  public complete(@Param('runId', ParseUUIDPipe) runId: string): Promise<unknown> {
    return this.assessment.complete(runId);
  }

  @Put('sessions/:sessionId/items/:itemId/attempt')
  @ApiOperation({ summary: 'Optimistic autosave attempt; stale revision → 409' })
  @ApiObjectOk('Сохранённая server copy attempt с новой revision')
  public autosave(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() input: AutosaveAttemptDto,
  ): Promise<unknown> {
    return this.assessment.autosave(sessionId, itemId, input);
  }

  @Post('attempts/:attemptId/submit')
  @ApiOperation({ summary: 'Submit и deterministic evaluation без оценки free text' })
  @ApiObjectOk('Submitted attempt и доступная deterministic evaluation')
  public submit(@Param('attemptId', ParseUUIDPipe) attemptId: string): Promise<unknown> {
    return this.assessment.submit(attemptId);
  }

  @Post('attempts/:attemptId/run-code')
  @ApiOperation({ summary: 'Сохранить schema-validated результат browser worker' })
  @ApiObjectOk('Attempt с сохранённым runner result')
  public runCode(
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() input: PersistRunnerResultDto,
  ): Promise<unknown> {
    return this.assessment.persistRunnerResult(attemptId, input.revision, input.runnerResult);
  }

  @Get('attempts/:attemptId/evaluations')
  @ApiObjectArrayOk('Immutable evaluations попытки')
  public evaluations(@Param('attemptId', ParseUUIDPipe) attemptId: string): Promise<unknown[]> {
    return this.assessment.evaluations(attemptId);
  }
}
