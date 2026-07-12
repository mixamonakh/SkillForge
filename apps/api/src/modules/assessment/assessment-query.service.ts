import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, SessionMode } from '@skillforge/db';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  SESSION_ITEM_INCLUDE,
  parseAssessmentSnapshot,
  serializeTaskItem,
  type AssessmentSnapshot,
} from '../learning/task-view.js';
import { pendingExternalReview } from './deterministic-evaluation.js';

@Injectable()
export class AssessmentQueryService {
  public constructor(private readonly database: PrismaService) {}

  public async catalog(): Promise<unknown[]> {
    const blueprints = await this.database.client.assessmentBlueprint.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      include: {
        items: { include: { taskVersion: { include: { task: true } } } },
        runs: {
          where: { userId: DEFAULT_USER_ID },
          orderBy: { createdAt: 'desc' },
          include: { session: { include: { attempts: { select: { submittedAt: true } } } } },
        },
      },
    });
    const latestByKey = new Map<string, (typeof blueprints)[number]>();
    for (const blueprint of blueprints) {
      if (!latestByKey.has(blueprint.key)) latestByKey.set(blueprint.key, blueprint);
    }
    return [...latestByKey.values()].map((blueprint) => {
      const active = blueprint.runs.find((run) =>
        ['DRAFT', 'ACTIVE', 'PAUSED'].includes(run.status),
      );
      const latestCompleted = blueprint.runs.find((run) => run.status === 'COMPLETED');
      return {
        key: blueprint.key,
        version: blueprint.version,
        title: blueprint.title,
        description: blueprint.description,
        totalBlocks: blueprint.totalBlocks,
        totalItems: blueprint.items.length,
        estimatedMin: blueprint.estimatedMin,
        taskKinds: [...new Set(blueprint.items.map((item) => item.taskVersion.task.kind))],
        activeRun: active
          ? {
              id: active.id,
              status: active.status,
              answered:
                active.session?.attempts.filter((attempt) => attempt.submittedAt).length ?? 0,
            }
          : null,
        latestCompletedRun: latestCompleted
          ? {
              id: latestCompleted.id,
              status: latestCompleted.status,
              answered:
                latestCompleted.session?.attempts.filter((attempt) => attempt.submittedAt).length ??
                0,
            }
          : null,
        completedRuns: blueprint.runs.filter((run) => run.status === 'COMPLETED').length,
      };
    });
  }

  public async assessment(key: string): Promise<unknown> {
    const blueprint = await this.database.client.assessmentBlueprint.findFirst({
      where: { key, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: { items: { include: { taskVersion: { include: { task: true } } } } },
    });
    if (!blueprint) throw notFound('ASSESSMENT_NOT_FOUND', 'Диагностика не найдена');
    return {
      key: blueprint.key,
      version: blueprint.version,
      title: blueprint.title,
      description: blueprint.description,
      totalBlocks: blueprint.totalBlocks,
      totalItems: blueprint.items.length,
      estimatedMin: blueprint.estimatedMin,
      taskKinds: [...new Set(blueprint.items.map((item) => item.taskVersion.task.kind))],
    };
  }

  public async createRun(key: string): Promise<unknown> {
    const existing = await this.database.client.assessmentRun.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        blueprint: { key },
        status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return this.run(existing.id);
    const blueprint = await this.database.client.assessmentBlueprint.findFirst({
      where: { key, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: {
        items: {
          orderBy: [{ blockIndex: 'asc' }, { position: 'asc' }],
          include: { taskVersion: { include: { task: { include: { topic: true } } } } },
        },
      },
    });
    if (!blueprint) throw notFound('ASSESSMENT_NOT_FOUND', 'Диагностика не найдена');
    if (blueprint.items.length === 0) {
      throw invalidState('ASSESSMENT_BLUEPRINT_EMPTY', 'Blueprint не содержит заданий');
    }
    const runId = await this.database.client.$transaction(async (transaction) => {
      const run = await transaction.assessmentRun.create({
        data: {
          userId: DEFAULT_USER_ID,
          blueprintId: blueprint.id,
          snapshot: asJsonInput({
            schemaVersion: '1.0',
            blueprint: {
              key: blueprint.key,
              version: blueprint.version,
              checksum: blueprint.checksum,
              totalBlocks: blueprint.totalBlocks,
            },
            items: [],
          }),
        },
      });
      const session = await transaction.learningSession.create({
        data: {
          userId: DEFAULT_USER_ID,
          assessmentRunId: run.id,
          mode: SessionMode.ASSESSMENT,
          loadMode: 'DEEP',
          title: blueprint.title,
          goal: 'Базовая калибровка JavaScript по versioned blueprint',
          planSnapshot: asJsonInput({
            blueprintKey: blueprint.key,
            blueprintVersion: blueprint.version,
          }),
        },
      });
      const snapshotItems: AssessmentSnapshot['items'] = [];
      for (const [globalPosition, blueprintItem] of blueprint.items.entries()) {
        const sessionItem = await transaction.sessionItem.create({
          data: {
            sessionId: session.id,
            taskVersionId: blueprintItem.taskVersionId,
            position: globalPosition,
            purpose: 'ASSESSMENT',
            required: blueprintItem.required,
          },
        });
        await transaction.attempt.create({
          data: {
            userId: DEFAULT_USER_ID,
            sessionId: session.id,
            sessionItemId: sessionItem.id,
            taskVersionId: blueprintItem.taskVersionId,
            sequence: 1,
          },
        });
        snapshotItems.push({
          sessionItemId: sessionItem.id,
          taskVersionId: blueprintItem.taskVersionId,
          blockIndex: blueprintItem.blockIndex,
          position: blueprintItem.position,
          required: blueprintItem.required,
          purpose: 'ASSESSMENT',
        });
      }
      const snapshot: AssessmentSnapshot = {
        schemaVersion: '1.0',
        blueprint: {
          key: blueprint.key,
          version: blueprint.version,
          checksum: blueprint.checksum,
          totalBlocks: blueprint.totalBlocks,
        },
        items: snapshotItems,
      };
      await transaction.assessmentRun.update({
        where: { id: run.id },
        data: { snapshot: asJsonInput(snapshot) },
      });
      await transaction.learningSession.update({
        where: { id: session.id },
        data: { planSnapshot: asJsonInput(snapshot) },
      });
      return run.id;
    });
    return this.run(runId);
  }

  public async run(runId: string): Promise<unknown> {
    const run = await this.database.client.assessmentRun.findFirst({
      where: { id: runId, userId: DEFAULT_USER_ID },
      include: {
        blueprint: true,
        session: {
          include: { items: { orderBy: { position: 'asc' }, include: SESSION_ITEM_INCLUDE } },
        },
      },
    });
    if (!run?.session)
      throw notFound('ASSESSMENT_RUN_NOT_FOUND', 'Прохождение диагностики не найдено');
    const snapshot = parseAssessmentSnapshot(run.snapshot);
    if (!snapshot)
      throw invalidState('ASSESSMENT_SNAPSHOT_INVALID', 'Snapshot диагностики повреждён');
    const snapshotByItem = new Map(snapshot.items.map((item) => [item.sessionItemId, item]));
    const items = run.session.items.map((item) =>
      serializeTaskItem(item, snapshotByItem.get(item.id), true),
    );
    const answeredCount = run.session.items.filter((item) => item.attempts[0]?.submittedAt).length;
    const pendingReviewCount = run.session.items.filter((item) => {
      const attempt = item.attempts[0];
      return attempt?.submittedAt && pendingExternalReview(item.taskVersion.task.kind);
    }).length;
    return {
      id: run.id,
      status: run.status,
      currentBlock: run.currentBlock,
      currentPosition: run.currentPosition,
      totalBlocks: snapshot.blueprint.totalBlocks,
      totalItems: snapshot.items.length,
      answeredCount,
      pendingReviewCount,
      sessionId: run.session.id,
      title: run.blueprint.title,
      items,
    };
  }
}
