import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, LearningPhase, SessionMode } from '@skillforge/db';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  SESSION_ITEM_INCLUDE,
  parseAssessmentSnapshot,
  projectDeterministicEvaluation,
  serializeTaskItem,
  type AssessmentSnapshot,
} from '../learning/task-view.js';
import { evaluationCoverage } from './deterministic-evaluation.js';
import {
  parsePrebaselineSnapshot,
  PREBASELINE_BLUEPRINT_KEY,
} from './prebaseline-snapshot.js';

function assessmentDisplayTitle(key: string, storedTitle: string): string {
  if (key === PREBASELINE_BLUEPRINT_KEY) return 'Быстрая калибровка JavaScript';
  if (key === 'js-baseline-v1') return 'Расширенная диагностика JavaScript Core';
  return storedTitle;
}

@Injectable()
export class AssessmentQueryService {
  public constructor(private readonly database: PrismaService) {}

  public async catalog(): Promise<unknown[]> {
    const blueprints = await this.database.client.assessmentBlueprint.findMany({
      where: {
        OR: [
          { status: 'ACTIVE' },
          { key: PREBASELINE_BLUEPRINT_KEY, status: 'DRAFT' },
        ],
      },
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
    const catalog = [...latestByKey.values()].map((blueprint) => {
      const active = blueprint.runs.find((run) =>
        ['DRAFT', 'ACTIVE', 'PAUSED'].includes(run.status),
      );
      const latestCompleted = blueprint.runs.find((run) => run.status === 'COMPLETED');
      return {
        key: blueprint.key,
        version: blueprint.version,
        title: assessmentDisplayTitle(blueprint.key, blueprint.title),
        description: blueprint.description,
        totalBlocks: blueprint.totalBlocks,
        totalItems: blueprint.items.length,
        estimatedMin: blueprint.estimatedMin,
        taskKinds: [...new Set(blueprint.items.map((item) => item.taskVersion.task.kind))],
        flow:
          blueprint.key === PREBASELINE_BLUEPRINT_KEY
            ? 'ADAPTIVE_PREBASELINE'
            : 'FIXED_ASSESSMENT',
        contentStatus: blueprint.status,
        reviewState:
          blueprint.status === 'DRAFT' ? 'NEEDS_HUMAN_REVIEW' : 'APPROVED',
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
    return catalog.sort((left, right) => {
      const leftPriority = left.activeRun
        ? 0
        : left.flow === 'ADAPTIVE_PREBASELINE'
          ? 1
          : 2;
      const rightPriority = right.activeRun
        ? 0
        : right.flow === 'ADAPTIVE_PREBASELINE'
          ? 1
          : 2;
      return leftPriority - rightPriority || left.key.localeCompare(right.key);
    });
  }

  public async assessment(key: string): Promise<unknown> {
    const blueprint = await this.database.client.assessmentBlueprint.findFirst({
      where:
        key === PREBASELINE_BLUEPRINT_KEY
          ? { key, status: { in: ['DRAFT', 'ACTIVE'] } }
          : { key, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      include: { items: { include: { taskVersion: { include: { task: true } } } } },
    });
    if (!blueprint) throw notFound('ASSESSMENT_NOT_FOUND', 'Диагностика не найдена');
    return {
      key: blueprint.key,
      version: blueprint.version,
      title: assessmentDisplayTitle(blueprint.key, blueprint.title),
      description: blueprint.description,
      totalBlocks: blueprint.totalBlocks,
      totalItems: blueprint.items.length,
      estimatedMin: blueprint.estimatedMin,
      taskKinds: [...new Set(blueprint.items.map((item) => item.taskVersion.task.kind))],
    };
  }

  public async createRun(key: string): Promise<unknown> {
    if (key === PREBASELINE_BLUEPRINT_KEY) {
      throw invalidState(
        'PREBASELINE_ADAPTIVE_START_REQUIRED',
        'Pre-baseline запускается только через adaptive start',
      );
    }
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
          learningPhase: LearningPhase.CALIBRATION,
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
    const prebaselineSnapshot = parsePrebaselineSnapshot(run.snapshot);
    if (!snapshot && !prebaselineSnapshot)
      throw invalidState('ASSESSMENT_SNAPSHOT_INVALID', 'Snapshot диагностики повреждён');
    if (prebaselineSnapshot) {
      const selectedByItem = new Map(
        prebaselineSnapshot.selectedHistory.map((item) => [item.sessionItemId, item]),
      );
      const candidateByVersion = new Map(
        prebaselineSnapshot.candidatePool.map((candidate) => [
          candidate.taskVersionId,
          candidate,
        ]),
      );
      const items = run.session.items.map((item) => {
        const selected = selectedByItem.get(item.id);
        const candidate = candidateByVersion.get(item.taskVersionId);
        return serializeTaskItem(
          item,
          selected && candidate
            ? {
                sessionItemId: item.id,
                taskVersionId: item.taskVersionId,
                blockIndex: candidate.blockIndex,
                position: candidate.position,
                required: false,
                purpose: 'PREBASELINE',
              }
            : undefined,
          true,
          true,
        );
      });
      const answeredCount = run.session.items.filter(
        (item) => item.attempts[0]?.submittedAt,
      ).length;
      const pendingReviewCount = run.session.items.filter((item) => {
        const attempt = item.attempts[0];
        if (!attempt?.submittedAt) return false;
        const projected = projectDeterministicEvaluation(attempt.evaluations[0], {
          taskKind: item.taskVersion.task.kind,
          rubric: item.taskVersion.rubric,
        });
        const coverage =
          projected?.coverage ??
          evaluationCoverage(item.taskVersion.task.kind, item.taskVersion.rubric, false);
        return coverage.pendingDimensions.length > 0;
      }).length;
      const lastDecision = prebaselineSnapshot.decisionHistory.at(-1)?.decision ?? null;
      return {
        flow: 'ADAPTIVE_PREBASELINE',
        id: run.id,
        status: run.status,
        currentBlock: run.currentBlock,
        currentPosition: run.currentPosition,
        totalBlocks: new Set(
          prebaselineSnapshot.candidatePool.map((candidate) => candidate.blockIndex),
        ).size,
        totalItems: prebaselineSnapshot.candidatePool.length,
        selectedCount: prebaselineSnapshot.selectedHistory.length,
        answeredCount,
        pendingReviewCount,
        sessionId: run.session.id,
        title: 'Быстрая калибровка JavaScript',
        contentStatus: prebaselineSnapshot.blueprint.contentStatus,
        reviewState: prebaselineSnapshot.blueprint.reviewState,
        stopDecision:
          lastDecision && lastDecision.decision !== 'NEXT_ITEM'
            ? {
                decision: lastDecision.decision,
                reasons: lastDecision.reasons,
                explanation: lastDecision.reasons.join(' '),
                dataSufficiency: lastDecision.dataSufficiency,
                primaryGap: lastDecision.primaryGap ?? null,
                recommendedPhase: lastDecision.recommendedPhase ?? null,
              }
            : null,
        items,
      };
    }
    if (!snapshot) {
      throw invalidState('ASSESSMENT_SNAPSHOT_INVALID', 'Snapshot диагностики повреждён');
    }
    const snapshotByItem = new Map(snapshot.items.map((item) => [item.sessionItemId, item]));
    const items = run.session.items.map((item) =>
      serializeTaskItem(item, snapshotByItem.get(item.id), true),
    );
    const answeredCount = run.session.items.filter((item) => item.attempts[0]?.submittedAt).length;
    const pendingReviewCount = run.session.items.filter((item) => {
      const attempt = item.attempts[0];
      if (!attempt?.submittedAt) return false;
      const projected = projectDeterministicEvaluation(attempt.evaluations[0], {
        taskKind: item.taskVersion.task.kind,
        rubric: item.taskVersion.rubric,
      });
      const coverage =
        projected?.coverage ??
        evaluationCoverage(item.taskVersion.task.kind, item.taskVersion.rubric, false);
      return coverage.pendingDimensions.length > 0;
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
      title: assessmentDisplayTitle(run.blueprint.key, run.blueprint.title),
      items,
    };
  }
}
