import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DEFAULT_USER_ID,
  LearningPhase,
  Prisma,
  RunStatus,
  SessionMode,
} from '@skillforge/db';
import type { AdaptiveRoutingDecision, CapabilityFamily } from '@skillforge/learning-engine';

import { ApiError, invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput, objectValue, stringArray } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SESSION_ITEM_INCLUDE, serializeTaskItem } from '../learning/task-view.js';
import {
  buildPrebaselineRoutingProfile,
  decidePrebaselineNext,
  type PrebaselineOutcome,
  type PrebaselineRoutingProfile,
} from './prebaseline-routing.js';
import {
  activeElapsedMilliseconds,
  parsePrebaselineSnapshot,
  pausePrebaselineSnapshot,
  PREBASELINE_ALGORITHM_VERSION,
  PREBASELINE_BLUEPRINT_KEY,
  PREBASELINE_ITEM_CAP,
  PREBASELINE_TIME_CAP_MINUTES,
  PrebaselineCapabilityFamilySchema,
  resumePrebaselineSnapshot,
  type PrebaselineAdaptiveDecision,
  type PrebaselineCandidate,
  type PrebaselineSnapshot,
} from './prebaseline-snapshot.js';

const PREBASELINE_BLUEPRINT_INCLUDE = {
  items: {
    orderBy: [{ blockIndex: 'asc' as const }, { position: 'asc' as const }],
    include: {
      taskVersion: {
        include: {
          task: {
            include: {
              topic: {
                include: {
                  prerequisites: {
                    include: { prerequisite: { select: { key: true } } },
                  },
                  dependents: {
                    include: { topic: { select: { key: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AssessmentBlueprintInclude;

const PREBASELINE_RUN_INCLUDE = {
  blueprint: true,
  session: {
    include: {
      items: {
        orderBy: { position: 'asc' as const },
        include: SESSION_ITEM_INCLUDE,
      },
    },
  },
} satisfies Prisma.AssessmentRunInclude;

type PrebaselineRunRecord = Prisma.AssessmentRunGetPayload<{
  include: typeof PREBASELINE_RUN_INCLUDE;
}>;

type PrebaselineBlueprintRecord = Prisma.AssessmentBlueprintGetPayload<{
  include: typeof PREBASELINE_BLUEPRINT_INCLUDE;
}>;

type CurrentItem = NonNullable<PrebaselineRunRecord['session']>['items'][number];

export type PrebaselineNextResponse = {
  flow: 'ADAPTIVE_PREBASELINE';
  runId: string;
  sessionId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  title: string;
  blueprint: {
    key: typeof PREBASELINE_BLUEPRINT_KEY;
    version: number;
    contentStatus: 'DRAFT' | 'ACTIVE';
    reviewState: 'NEEDS_HUMAN_REVIEW' | 'APPROVED';
  };
  progress: {
    selected: number;
    answered: number;
    pendingReview: number;
    totalCandidates: number;
    elapsedMinutes: number;
    hardCaps: { items: number; minutes: number };
  };
  decision: AdaptiveRoutingDecision['decision'];
  item: unknown;
  cluster: { topicKey: string; title: string } | null;
  reasons: string[];
  explanation: string;
  scoreBreakdown: Record<string, number>;
  dataSufficiency: AdaptiveRoutingDecision['dataSufficiency'];
  primaryGap: CapabilityFamily | null;
  recommendedPhase: AdaptiveRoutingDecision['recommendedPhase'] | null;
  routingProfile: PrebaselineRoutingProfile | null;
};

function stableNumericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(objectValue(value)).filter(
      (entry): entry is [string, number] =>
        /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(entry[0]) &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]),
    ),
  );
}

function requireV2Candidate(
  item: PrebaselineBlueprintRecord['items'][number],
): PrebaselineCandidate {
  const metadata = objectValue(item.taskVersion.metadata);
  const evidenceFamiliesRaw = stringArray(metadata.evidenceFamilies);
  const evidenceFamilies = evidenceFamiliesRaw.flatMap((family) => {
    const parsed = PrebaselineCapabilityFamilySchema.safeParse(family);
    return parsed.success ? [parsed.data] : [];
  });
  const primaryFamily = evidenceFamilies[0];
  const familyKey = metadata.familyKey;
  const estimatedMinutes = metadata.estimatedMinutes;
  const productionLoad = metadata.productionLoad;
  if (
    metadata.schemaVersion !== '2.0' ||
    primaryFamily === undefined ||
    evidenceFamilies.length !== evidenceFamiliesRaw.length ||
    typeof familyKey !== 'string' ||
    typeof estimatedMinutes !== 'number' ||
    !Number.isSafeInteger(estimatedMinutes) ||
    estimatedMinutes <= 0 ||
    !['NONE', 'LOW', 'MEDIUM', 'HIGH'].includes(String(productionLoad))
  ) {
    throw invalidState(
      'PREBASELINE_METADATA_INVALID',
      `Task ${item.taskVersion.task.stableKey} не имеет полного metadata v2`,
    );
  }
  return {
    taskVersionId: item.taskVersionId,
    taskKey: item.taskVersion.task.stableKey,
    taskVersion: item.taskVersion.version,
    topicKey: item.taskVersion.task.topic.key,
    topicTitle: item.taskVersion.task.topic.title,
    prerequisiteTopicKeys: item.taskVersion.task.topic.prerequisites
      .map((dependency) => dependency.prerequisite.key)
      .sort(),
    unlocksTopicKeys: item.taskVersion.task.topic.dependents
      .map((dependency) => dependency.topic.key)
      .sort(),
    blockIndex: item.blockIndex,
    position: item.position,
    required: item.required,
    taskKind: item.taskVersion.task.kind,
    difficulty: item.taskVersion.task.difficulty,
    primaryFamily,
    evidenceFamilies,
    familyKey,
    misconceptionTags: stringArray(metadata.misconceptionTags),
    estimatedMinutes,
    productionLoad: productionLoad as PrebaselineCandidate['productionLoad'],
    targetRelevance: stableNumericRecord(metadata.targetRelevance),
  };
}

function createSnapshot(
  blueprint: PrebaselineBlueprintRecord,
  startedAt: Date,
): PrebaselineSnapshot {
  if (blueprint.items.length === 0 || blueprint.items.length > PREBASELINE_ITEM_CAP) {
    throw invalidState(
      'PREBASELINE_CANDIDATE_POOL_INVALID',
      `Pre-baseline требует от 1 до ${String(PREBASELINE_ITEM_CAP)} candidates`,
    );
  }
  const contentStatus = blueprint.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT';
  return {
    schemaVersion: '2.0',
    kind: 'ADAPTIVE_PREBASELINE',
    algorithmVersion: PREBASELINE_ALGORITHM_VERSION,
    blueprint: {
      key: PREBASELINE_BLUEPRINT_KEY,
      version: blueprint.version,
      checksum: blueprint.checksum,
      contentStatus,
      reviewState: contentStatus === 'DRAFT' ? 'NEEDS_HUMAN_REVIEW' : 'APPROVED',
      estimatedMinutes: blueprint.estimatedMin,
    },
    hardCaps: {
      items: PREBASELINE_ITEM_CAP,
      minutes: PREBASELINE_TIME_CAP_MINUTES,
    },
    candidatePool: blueprint.items.map(requireV2Candidate),
    selectedHistory: [],
    decisionHistory: [],
    timing: {
      startedAt: startedAt.toISOString(),
      activeStartedAt: startedAt.toISOString(),
      accumulatedActiveMs: 0,
    },
  };
}

function isUnknownAnswer(attempt: CurrentItem['attempts'][number]): boolean {
  const normalized = attempt.answerText
    ?.trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[.!?]+$/u, '');
  return normalized === 'не знаю' || stringArray(attempt.selectedOptions).includes('unknown');
}

function outcomeStatus(input: {
  unknown: boolean;
  evaluation: { rawScore: number | null; passed: boolean | null } | undefined;
}): PrebaselineOutcome['status'] {
  if (input.unknown) return 'UNKNOWN';
  if (input.evaluation?.passed === true || input.evaluation?.rawScore === 100) return 'CORRECT';
  if (input.evaluation?.passed === false || input.evaluation?.rawScore === 0) return 'INCORRECT';
  return 'PENDING';
}

function outcomesForRun(
  snapshot: PrebaselineSnapshot,
  run: PrebaselineRunRecord,
  evaluationByAttempt: ReadonlyMap<
    string,
    { rawScore: number | null; passed: boolean | null }
  >,
): PrebaselineOutcome[] {
  if (run.session === null) return [];
  return snapshot.selectedHistory.flatMap((selection) => {
    const item = run.session?.items.find((candidate) => candidate.id === selection.sessionItemId);
    const attempt = item?.attempts[0];
    const candidate = snapshot.candidatePool.find(
      (entry) => entry.taskVersionId === selection.taskVersionId,
    );
    if (!attempt?.submittedAt || candidate === undefined) return [];
    return [
      {
        taskVersionId: candidate.taskVersionId,
        topicKey: candidate.topicKey,
        primaryFamily: candidate.primaryFamily,
        status: outcomeStatus({
          unknown: isUnknownAnswer(attempt),
          evaluation: evaluationByAttempt.get(attempt.id),
        }),
        misconceptionTags: [...candidate.misconceptionTags],
        submittedAt: attempt.submittedAt.toISOString(),
      },
    ];
  });
}

function appendDecision(
  snapshot: PrebaselineSnapshot,
  decision: PrebaselineAdaptiveDecision,
  decidedAt: Date,
): PrebaselineSnapshot {
  return {
    ...snapshot,
    decisionHistory: [
      ...snapshot.decisionHistory,
      {
        sequence: snapshot.decisionHistory.length + 1,
        decidedAt: decidedAt.toISOString(),
        decision,
      },
    ],
  };
}

function restoreAdaptiveDecision(
  decision: PrebaselineAdaptiveDecision,
): AdaptiveRoutingDecision {
  return {
    decision: decision.decision,
    reasons: [...decision.reasons],
    scoreBreakdown: { ...decision.scoreBreakdown },
    dataSufficiency: decision.dataSufficiency,
    ...(decision.nextTaskVersionId === undefined
      ? {}
      : { nextTaskVersionId: decision.nextTaskVersionId }),
    ...(decision.topicKey === undefined ? {} : { topicKey: decision.topicKey }),
    ...(decision.primaryGap === undefined ? {} : { primaryGap: decision.primaryGap }),
    ...(decision.recommendedPhase === undefined
      ? {}
      : { recommendedPhase: decision.recommendedPhase }),
  };
}

@Injectable()
export class PrebaselineAssessmentService {
  public constructor(private readonly database: PrismaService) {}

  public async start(): Promise<PrebaselineNextResponse> {
    const existing = await this.database.client.assessmentRun.findFirst({
      where: {
        userId: DEFAULT_USER_ID,
        blueprint: { key: PREBASELINE_BLUEPRINT_KEY },
        status: { in: [RunStatus.DRAFT, RunStatus.ACTIVE, RunStatus.PAUSED] },
      },
      orderBy: { createdAt: 'desc' },
      include: PREBASELINE_RUN_INCLUDE,
    });
    if (existing !== null) {
      const snapshot = parsePrebaselineSnapshot(existing.snapshot);
      if (snapshot === null || existing.session === null) {
        throw invalidState(
          'PREBASELINE_SNAPSHOT_INVALID',
          'Существующий pre-baseline run имеет несовместимый snapshot',
        );
      }
      if (existing.status !== RunStatus.ACTIVE) {
        const now = new Date();
        const resumed = resumePrebaselineSnapshot(snapshot, now);
        await this.database.client.$transaction([
          this.database.client.assessmentRun.update({
            where: { id: existing.id },
            data: {
              status: RunStatus.ACTIVE,
              startedAt: existing.startedAt ?? now,
              pausedAt: null,
              snapshot: asJsonInput(resumed),
            },
          }),
          this.database.client.learningSession.update({
            where: { id: existing.session.id },
            data: {
              status: RunStatus.ACTIVE,
              startedAt: existing.session.startedAt ?? now,
              pausedAt: null,
              planSnapshot: asJsonInput(resumed),
            },
          }),
        ]);
      }
      return this.next(existing.id);
    }

    const blueprint = await this.database.client.assessmentBlueprint.findFirst({
      where: {
        key: PREBASELINE_BLUEPRINT_KEY,
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      orderBy: { version: 'desc' },
      include: PREBASELINE_BLUEPRINT_INCLUDE,
    });
    if (blueprint === null) {
      throw notFound(
        'PREBASELINE_NOT_IMPORTED',
        'Draft pack js-prebaseline-v1 не импортирован',
      );
    }
    const startedAt = new Date();
    const snapshot = createSnapshot(blueprint, startedAt);
    const runId = await this.database.client.$transaction(async (transaction) => {
      const run = await transaction.assessmentRun.create({
        data: {
          userId: DEFAULT_USER_ID,
          blueprintId: blueprint.id,
          status: RunStatus.ACTIVE,
          startedAt,
          snapshot: asJsonInput(snapshot),
        },
      });
      await transaction.learningSession.create({
        data: {
          userId: DEFAULT_USER_ID,
          assessmentRunId: run.id,
          mode: SessionMode.ASSESSMENT,
          learningPhase: LearningPhase.CALIBRATION,
          loadMode: 'MINIMAL',
          title: 'Быстрая калибровка JavaScript',
          goal: 'Локализовать следующий полезный шаг без mastery verdict',
          status: RunStatus.ACTIVE,
          startedAt,
          planSnapshot: asJsonInput(snapshot),
        },
      });
      return run.id;
    });
    return this.next(runId);
  }

  public async next(runId: string): Promise<PrebaselineNextResponse> {
    return this.database.client.$transaction(
      async (transaction) => {
        const run = await transaction.assessmentRun.findFirst({
          where: { id: runId, userId: DEFAULT_USER_ID },
          include: PREBASELINE_RUN_INCLUDE,
        });
        if (run?.session === null || run === null) {
          throw notFound('PREBASELINE_RUN_NOT_FOUND', 'Pre-baseline run не найден');
        }
        let snapshot = parsePrebaselineSnapshot(run.snapshot);
        if (snapshot === null) {
          throw invalidState(
            'PREBASELINE_SNAPSHOT_INVALID',
            'Snapshot pre-baseline не соответствует schema v2',
          );
        }
        const incomplete = run.session.items.find(
          (item) => item.attempts[0]?.submittedAt === null,
        );
        const evaluationByAttempt = await this.evaluationsForRun(transaction, run);
        const outcomes = outcomesForRun(snapshot, run, evaluationByAttempt);
        if (incomplete !== undefined) {
          return this.itemResponse(run, snapshot, outcomes, incomplete);
        }
        const storedStop = snapshot.decisionHistory
          .map((entry) => entry.decision)
          .findLast((decision) => decision.decision !== 'NEXT_ITEM');
        if (storedStop !== undefined) {
          return this.stopResponse(
            run,
            snapshot,
            outcomes,
            restoreAdaptiveDecision(storedStop),
          );
        }
        if (run.status === RunStatus.PAUSED) {
          throw invalidState(
            'PREBASELINE_RUN_PAUSED',
            'Возобнови диагностику перед выбором следующего item',
          );
        }
        if (run.status !== RunStatus.ACTIVE) {
          throw invalidState(
            'PREBASELINE_RUN_NOT_ACTIVE',
            'Pre-baseline run не находится в активном состоянии',
          );
        }
        const settings = await transaction.userSettings.findUnique({
          where: { userId: DEFAULT_USER_ID },
          select: { targetTrackKey: true },
        });
        const now = new Date();
        const decision = decidePrebaselineNext({
          snapshot,
          outcomes,
          targetTrackKey: settings?.targetTrackKey ?? null,
          now,
        });
        snapshot = appendDecision(snapshot, decision, now);
        if (decision.decision === 'NEXT_ITEM' && decision.nextTaskVersionId !== undefined) {
          const candidate = snapshot.candidatePool.find(
            (item) => item.taskVersionId === decision.nextTaskVersionId,
          );
          if (candidate === undefined) {
            throw invalidState(
              'PREBASELINE_DECISION_INVALID',
              'Adaptive engine выбрал task вне immutable candidate pool',
            );
          }
          const sessionItem = await transaction.sessionItem.create({
            data: {
              sessionId: run.session.id,
              taskVersionId: candidate.taskVersionId,
              position: snapshot.selectedHistory.length,
              purpose: 'PREBASELINE',
              required: false,
            },
          });
          await transaction.attempt.create({
            data: {
              userId: DEFAULT_USER_ID,
              sessionId: run.session.id,
              sessionItemId: sessionItem.id,
              taskVersionId: candidate.taskVersionId,
              sequence: 1,
            },
          });
          snapshot = {
            ...snapshot,
            selectedHistory: [
              ...snapshot.selectedHistory,
              {
                sequence: snapshot.selectedHistory.length + 1,
                taskVersionId: candidate.taskVersionId,
                sessionItemId: sessionItem.id,
                selectedAt: now.toISOString(),
                decision,
              },
            ],
          };
          await transaction.assessmentRun.update({
            where: { id: run.id },
            data: {
              currentBlock: candidate.blockIndex,
              currentPosition: candidate.position,
              snapshot: asJsonInput(snapshot),
            },
          });
          await transaction.learningSession.update({
            where: { id: run.session.id },
            data: {
              planSnapshot: asJsonInput(snapshot),
              lastStepLabel: `${candidate.topicTitle}: ${candidate.taskKey}`,
            },
          });
          const created = await transaction.sessionItem.findUniqueOrThrow({
            where: { id: sessionItem.id },
            include: SESSION_ITEM_INCLUDE,
          });
          return this.itemResponse(
            { ...run, snapshot, session: { ...run.session, items: [...run.session.items, created] } },
            snapshot,
            outcomes,
            created,
          );
        }

        const completedAt = now;
        const completedSnapshot = pausePrebaselineSnapshot(snapshot, completedAt);
        const durationSec = Math.round(
          activeElapsedMilliseconds(completedSnapshot, completedAt) / 1_000,
        );
        await transaction.assessmentRun.update({
          where: { id: run.id },
          data: {
            status: RunStatus.COMPLETED,
            completedAt,
            pausedAt: null,
            snapshot: asJsonInput(completedSnapshot),
          },
        });
        await transaction.learningSession.update({
          where: { id: run.session.id },
          data: {
            status: RunStatus.COMPLETED,
            completedAt,
            pausedAt: null,
            durationSec,
            lastStepLabel: 'Маршрут калибровки определён',
            planSnapshot: asJsonInput(completedSnapshot),
          },
        });
        return this.stopResponse(
          { ...run, status: RunStatus.COMPLETED, snapshot: completedSnapshot },
          completedSnapshot,
          outcomes,
          decision,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  public async routingProfile(runId: string): Promise<PrebaselineRoutingProfile> {
    const run = await this.database.client.assessmentRun.findFirst({
      where: { id: runId, userId: DEFAULT_USER_ID },
      include: PREBASELINE_RUN_INCLUDE,
    });
    if (run?.session === null || run === null) {
      throw notFound('PREBASELINE_RUN_NOT_FOUND', 'Pre-baseline run не найден');
    }
    const snapshot = parsePrebaselineSnapshot(run.snapshot);
    if (snapshot === null) {
      throw invalidState(
        'PREBASELINE_SNAPSHOT_INVALID',
        'Snapshot pre-baseline не соответствует schema v2',
      );
    }
    const evaluationByAttempt = await this.evaluationsForRun(this.database.client, run);
    const outcomes = outcomesForRun(snapshot, run, evaluationByAttempt);
    const storedDecision = snapshot.decisionHistory.at(-1)?.decision;
    return buildPrebaselineRoutingProfile({
      assessmentRunId: run.id,
      snapshot,
      outcomes,
      ...(storedDecision === undefined
        ? {}
        : { decision: restoreAdaptiveDecision(storedDecision) }),
    });
  }

  private async evaluationsForRun(
    client: Pick<Prisma.TransactionClient, 'evaluation'>,
    run: PrebaselineRunRecord,
  ): Promise<Map<string, { rawScore: number | null; passed: boolean | null }>> {
    const attemptIds =
      run.session?.items.flatMap((item) => item.attempts.map((attempt) => attempt.id)) ?? [];
    if (attemptIds.length === 0) return new Map();
    const evaluations = await client.evaluation.findMany({
      where: {
        attemptId: { in: attemptIds },
        supersededBy: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { attemptId: true, rawScore: true, passed: true },
    });
    const byAttempt = new Map<string, { rawScore: number | null; passed: boolean | null }>();
    for (const evaluation of evaluations) {
      if (!byAttempt.has(evaluation.attemptId)) {
        byAttempt.set(evaluation.attemptId, evaluation);
      }
    }
    return byAttempt;
  }

  private itemResponse(
    run: PrebaselineRunRecord,
    snapshot: PrebaselineSnapshot,
    outcomes: readonly PrebaselineOutcome[],
    item: CurrentItem,
  ): PrebaselineNextResponse {
    if (run.session === null) {
      throw new ApiError(
        'PREBASELINE_SESSION_MISSING',
        'Linked calibration session не найдена',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const selection = snapshot.selectedHistory.find((entry) => entry.sessionItemId === item.id);
    const candidate = snapshot.candidatePool.find(
      (entry) => entry.taskVersionId === item.taskVersionId,
    );
    if (selection === undefined || candidate === undefined) {
      throw invalidState(
        'PREBASELINE_SELECTION_INVALID',
        'SessionItem отсутствует в immutable selected history',
      );
    }
    const currentDecision = restoreAdaptiveDecision(selection.decision);
    const reasons = item.attempts[0]?.submittedAt
      ? currentDecision.reasons
      : ['Возвращён текущий незавершённый item; новый candidate не создавался.'];
    return this.responseBase(run, snapshot, outcomes, currentDecision, {
      item: serializeTaskItem(
        item,
        {
          sessionItemId: item.id,
          taskVersionId: item.taskVersionId,
          blockIndex: candidate.blockIndex,
          position: candidate.position,
          required: false,
          purpose: 'PREBASELINE',
        },
        true,
        true,
      ),
      cluster: { topicKey: candidate.topicKey, title: candidate.topicTitle },
      reasons,
      routingProfile: null,
    });
  }

  private stopResponse(
    run: PrebaselineRunRecord,
    snapshot: PrebaselineSnapshot,
    outcomes: readonly PrebaselineOutcome[],
    decision: AdaptiveRoutingDecision,
  ): PrebaselineNextResponse {
    const routingProfile = buildPrebaselineRoutingProfile({
      assessmentRunId: run.id,
      snapshot,
      outcomes,
      decision,
    });
    return this.responseBase(run, snapshot, outcomes, decision, {
      item: null,
      cluster: null,
      reasons: decision.reasons,
      routingProfile,
    });
  }

  private responseBase(
    run: PrebaselineRunRecord,
    snapshot: PrebaselineSnapshot,
    outcomes: readonly PrebaselineOutcome[],
    decision: AdaptiveRoutingDecision,
    content: Pick<PrebaselineNextResponse, 'item' | 'cluster' | 'reasons' | 'routingProfile'>,
  ): PrebaselineNextResponse {
    if (run.session === null) {
      throw new ApiError(
        'PREBASELINE_SESSION_MISSING',
        'Linked calibration session не найдена',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return {
      flow: 'ADAPTIVE_PREBASELINE',
      runId: run.id,
      sessionId: run.session.id,
      status:
        run.status === RunStatus.PAUSED
          ? 'PAUSED'
          : run.status === RunStatus.COMPLETED
            ? 'COMPLETED'
            : 'ACTIVE',
      title: 'Быстрая калибровка JavaScript',
      blueprint: {
        key: snapshot.blueprint.key,
        version: snapshot.blueprint.version,
        contentStatus: snapshot.blueprint.contentStatus,
        reviewState: snapshot.blueprint.reviewState,
      },
      progress: {
        selected: snapshot.selectedHistory.length,
        answered: outcomes.length,
        pendingReview: outcomes.filter((outcome) => outcome.status === 'PENDING').length,
        totalCandidates: snapshot.candidatePool.length,
        elapsedMinutes: Math.round((activeElapsedMilliseconds(snapshot) / 60_000) * 10) / 10,
        hardCaps: { ...snapshot.hardCaps },
      },
      decision: decision.decision,
      item: content.item,
      cluster: content.cluster,
      reasons: content.reasons,
      explanation: content.reasons.join(' '),
      scoreBreakdown: { ...decision.scoreBreakdown },
      dataSufficiency: decision.dataSufficiency,
      primaryGap: decision.primaryGap ?? null,
      recommendedPhase: decision.recommendedPhase ?? null,
      routingProfile: content.routingProfile,
    };
  }
}
