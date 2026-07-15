import { Injectable } from '@nestjs/common';

import type { AutosaveAttemptDto } from './assessment.dto.js';
import { AssessmentLifecycleService } from './assessment-lifecycle.service.js';
import { AssessmentQueryService } from './assessment-query.service.js';
import { AttemptAutosaveService } from './attempt-autosave.service.js';
import { AttemptEvaluationService } from './attempt-evaluation.service.js';
import { PrebaselineAssessmentService } from './prebaseline-assessment.service.js';

@Injectable()
export class AssessmentService {
  public constructor(
    private readonly queries: AssessmentQueryService,
    private readonly lifecycle: AssessmentLifecycleService,
    private readonly autosaves: AttemptAutosaveService,
    private readonly evaluationsService: AttemptEvaluationService,
    private readonly prebaseline: PrebaselineAssessmentService,
  ) {}

  public catalog(): Promise<unknown[]> {
    return this.queries.catalog();
  }

  public assessment(key: string): Promise<unknown> {
    return this.queries.assessment(key);
  }

  public createRun(key: string): Promise<unknown> {
    return this.queries.createRun(key);
  }

  public startPrebaseline(): Promise<unknown> {
    return this.prebaseline.start();
  }

  public nextPrebaseline(runId: string): Promise<unknown> {
    return this.prebaseline.next(runId);
  }

  public prebaselineRoutingProfile(runId: string): Promise<unknown> {
    return this.prebaseline.routingProfile(runId);
  }

  public run(runId: string): Promise<unknown> {
    return this.queries.run(runId);
  }

  public start(runId: string): Promise<unknown> {
    return this.lifecycle.start(runId);
  }

  public pause(runId: string): Promise<unknown> {
    return this.lifecycle.pause(runId);
  }

  public resume(runId: string): Promise<unknown> {
    return this.lifecycle.resume(runId);
  }

  public completeBlock(runId: string): Promise<unknown> {
    return this.lifecycle.completeBlock(runId);
  }

  public complete(runId: string): Promise<unknown> {
    return this.lifecycle.complete(runId);
  }

  public autosave(sessionId: string, itemId: string, input: AutosaveAttemptDto): Promise<unknown> {
    return this.autosaves.autosave(sessionId, itemId, input);
  }

  public persistRunnerResult(
    attemptId: string,
    revision: number,
    rawResult: unknown,
  ): Promise<unknown> {
    return this.evaluationsService.persistRunnerResult(attemptId, revision, rawResult);
  }

  public submit(attemptId: string): Promise<unknown> {
    return this.evaluationsService.submit(attemptId);
  }

  public evaluations(attemptId: string): Promise<unknown[]> {
    return this.evaluationsService.evaluations(attemptId);
  }
}
