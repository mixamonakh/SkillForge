import { HttpStatus, Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, RunStatus } from '@skillforge/db';

import { ApiError, invalidState, notFound } from '../../common/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { asJsonInput } from '../../common/json.js';
import { parseAssessmentSnapshot } from '../learning/task-view.js';
import { AssessmentQueryService } from './assessment-query.service.js';
import {
  parsePrebaselineSnapshot,
  pausePrebaselineSnapshot,
  resumePrebaselineSnapshot,
} from './prebaseline-snapshot.js';

@Injectable()
export class AssessmentLifecycleService {
  public constructor(
    private readonly database: PrismaService,
    private readonly queries: AssessmentQueryService,
  ) {}

  public async start(runId: string): Promise<unknown> {
    const run = await this.requireRun(runId);
    if (run.status === 'ACTIVE') return this.queries.run(runId);
    if (run.status !== 'DRAFT') {
      throw invalidState('ASSESSMENT_RUN_NOT_DRAFT', 'Диагностика уже была запущена');
    }
    const now = new Date();
    const prebaseline = parsePrebaselineSnapshot(run.snapshot);
    const resumedSnapshot = prebaseline ? resumePrebaselineSnapshot(prebaseline, now) : null;
    await this.database.client.$transaction([
      this.database.client.assessmentRun.update({
        where: { id: runId },
        data: {
          status: RunStatus.ACTIVE,
          startedAt: now,
          pausedAt: null,
          ...(resumedSnapshot ? { snapshot: asJsonInput(resumedSnapshot) } : {}),
        },
      }),
      this.database.client.learningSession.update({
        where: { assessmentRunId: runId },
        data: {
          status: RunStatus.ACTIVE,
          startedAt: now,
          pausedAt: null,
          ...(resumedSnapshot ? { planSnapshot: asJsonInput(resumedSnapshot) } : {}),
        },
      }),
    ]);
    return this.queries.run(runId);
  }

  public async pause(runId: string): Promise<unknown> {
    const run = await this.requireRun(runId);
    if (run.status === 'PAUSED') return this.queries.run(runId);
    if (run.status !== 'ACTIVE') {
      throw invalidState(
        'ASSESSMENT_RUN_NOT_ACTIVE',
        'Диагностика не находится в активном состоянии',
      );
    }
    const now = new Date();
    const prebaseline = parsePrebaselineSnapshot(run.snapshot);
    const pausedSnapshot = prebaseline ? pausePrebaselineSnapshot(prebaseline, now) : null;
    await this.database.client.$transaction([
      this.database.client.assessmentRun.update({
        where: { id: runId },
        data: {
          status: RunStatus.PAUSED,
          pausedAt: now,
          ...(pausedSnapshot ? { snapshot: asJsonInput(pausedSnapshot) } : {}),
        },
      }),
      this.database.client.learningSession.update({
        where: { assessmentRunId: runId },
        data: {
          status: RunStatus.PAUSED,
          pausedAt: now,
          ...(pausedSnapshot ? { planSnapshot: asJsonInput(pausedSnapshot) } : {}),
        },
      }),
    ]);
    return this.queries.run(runId);
  }

  public async resume(runId: string): Promise<unknown> {
    const run = await this.requireRun(runId);
    if (run.status === 'ACTIVE') return this.queries.run(runId);
    if (run.status !== 'PAUSED') {
      throw invalidState('ASSESSMENT_RUN_NOT_PAUSED', 'Диагностика не находится на паузе');
    }
    const now = new Date();
    const prebaseline = parsePrebaselineSnapshot(run.snapshot);
    const resumedSnapshot = prebaseline ? resumePrebaselineSnapshot(prebaseline, now) : null;
    await this.database.client.$transaction([
      this.database.client.assessmentRun.update({
        where: { id: runId },
        data: {
          status: RunStatus.ACTIVE,
          pausedAt: null,
          ...(resumedSnapshot ? { snapshot: asJsonInput(resumedSnapshot) } : {}),
        },
      }),
      this.database.client.learningSession.update({
        where: { assessmentRunId: runId },
        data: {
          status: RunStatus.ACTIVE,
          pausedAt: null,
          ...(resumedSnapshot ? { planSnapshot: asJsonInput(resumedSnapshot) } : {}),
        },
      }),
    ]);
    return this.queries.run(runId);
  }

  public async completeBlock(runId: string): Promise<unknown> {
    const run = await this.requireRun(runId);
    if (parsePrebaselineSnapshot(run.snapshot)) {
      throw invalidState(
        'PREBASELINE_ADAPTIVE_NEXT_REQUIRED',
        'Pre-baseline продвигается только через adaptive next',
      );
    }
    if (run.status !== 'ACTIVE') {
      throw invalidState(
        'ASSESSMENT_RUN_NOT_ACTIVE',
        'Диагностика не находится в активном состоянии',
      );
    }
    const snapshot = parseAssessmentSnapshot(run.snapshot);
    if (!snapshot || !run.session) {
      throw invalidState('ASSESSMENT_SNAPSHOT_INVALID', 'Snapshot диагностики повреждён');
    }
    const required = snapshot.items.filter(
      (item) => item.blockIndex === run.currentBlock && item.required,
    );
    const attempts = await this.database.client.attempt.findMany({
      where: { sessionItemId: { in: required.map((item) => item.sessionItemId) } },
      orderBy: { sequence: 'desc' },
    });
    const latestByItem = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (attempt.sessionItemId && !latestByItem.has(attempt.sessionItemId)) {
        latestByItem.set(attempt.sessionItemId, attempt);
      }
    }
    const missing = required.filter((item) => !latestByItem.get(item.sessionItemId)?.submittedAt);
    if (missing.length > 0) {
      throw new ApiError(
        'ASSESSMENT_BLOCK_INCOMPLETE',
        'Сначала сохрани обязательные ответы текущего блока',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { missingItemIds: missing.map((item) => item.sessionItemId) },
      );
    }
    if (run.currentBlock < snapshot.blueprint.totalBlocks - 1) {
      await this.database.client.assessmentRun.update({
        where: { id: runId },
        data: { currentBlock: run.currentBlock + 1, currentPosition: 0 },
      });
    }
    return this.queries.run(runId);
  }

  public async complete(runId: string): Promise<unknown> {
    const run = await this.requireRun(runId);
    if (parsePrebaselineSnapshot(run.snapshot)) {
      throw invalidState(
        'PREBASELINE_ADAPTIVE_NEXT_REQUIRED',
        'Pre-baseline завершается только stop decision adaptive routing',
      );
    }
    if (run.status === 'COMPLETED') return this.queries.run(runId);
    if (run.status !== 'ACTIVE' || !run.session) {
      throw invalidState(
        'ASSESSMENT_RUN_NOT_ACTIVE',
        'Диагностика не находится в активном состоянии',
      );
    }
    const snapshot = parseAssessmentSnapshot(run.snapshot);
    if (!snapshot)
      throw invalidState('ASSESSMENT_SNAPSHOT_INVALID', 'Snapshot диагностики повреждён');
    const requiredIds = snapshot.items
      .filter((item) => item.required)
      .map((item) => item.sessionItemId);
    const attempts = await this.database.client.attempt.findMany({
      where: { sessionItemId: { in: requiredIds } },
      orderBy: { sequence: 'desc' },
    });
    const latestByItem = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      if (attempt.sessionItemId && !latestByItem.has(attempt.sessionItemId)) {
        latestByItem.set(attempt.sessionItemId, attempt);
      }
    }
    if (requiredIds.some((id) => !latestByItem.get(id)?.submittedAt)) {
      throw invalidState(
        'ASSESSMENT_RUN_INCOMPLETE',
        'Нельзя завершить диагностику до отправки обязательных ответов',
      );
    }
    const now = new Date();
    const durationSec = run.startedAt
      ? Math.max(0, Math.round((now.getTime() - run.startedAt.getTime()) / 1_000))
      : 0;
    await this.database.client.$transaction([
      this.database.client.assessmentRun.update({
        where: { id: runId },
        data: { status: RunStatus.COMPLETED, completedAt: now, pausedAt: null },
      }),
      this.database.client.learningSession.update({
        where: { id: run.session.id },
        data: {
          status: RunStatus.COMPLETED,
          completedAt: now,
          pausedAt: null,
          durationSec,
          lastStepLabel: 'Диагностика завершена',
        },
      }),
    ]);
    return this.queries.run(runId);
  }

  private async requireRun(runId: string) {
    const run = await this.database.client.assessmentRun.findFirst({
      where: { id: runId, userId: DEFAULT_USER_ID },
      include: { session: true },
    });
    if (!run) throw notFound('ASSESSMENT_RUN_NOT_FOUND', 'Прохождение диагностики не найдено');
    return run;
  }
}
