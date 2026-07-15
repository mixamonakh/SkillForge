import { Injectable } from '@nestjs/common';
import {
  DEFAULT_USER_ID,
  LearningPhase,
  LoadMode,
  RunStatus,
  SessionMode,
  type TaskKind,
} from '@skillforge/db';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput, objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SESSION_ITEM_INCLUDE, serializeTaskItem } from '../learning/task-view.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { SessionRecommendationService } from './session-recommendation.service.js';
import { resolveLearningPhase } from './session-learning-phase.js';
import {
  filterLearningSequencesByAvailableReferences,
  filterLearningSequencesByActiveSource,
  selectStoredLearningSequence,
  type SelectedLearningSequence,
  type StoredLearningSequenceBlueprint,
} from './session-sequence.js';
import { selectSessionTasks } from './session-planner.js';
import type { CompleteSessionDto, SessionListQueryDto, SessionPlanDto } from './sessions.dto.js';

type ResolvedSequenceStep =
  | {
      kind: 'CONTENT';
      contentItemKey: string;
      version: number;
      sequencePosition: number;
      required: boolean;
      contentItemId: string;
      checksum: string;
      contentSnapshot: ContentStepSnapshot;
    }
  | {
      kind: 'TASK';
      taskKey: string;
      version: number;
      purpose: string;
      sequencePosition: number;
      required: boolean;
      taskVersionId: string;
      checksum: string;
      taskKind: TaskKind;
      language: string | null;
    };

type ResolvedSequence = {
  selected: SelectedLearningSequence;
  steps: ResolvedSequenceStep[];
};

type TaskReference = {
  id: string;
  version: number;
  checksum: string;
  language: string | null;
  task: { stableKey: string; kind: TaskKind };
};

type ContentReference = {
  id: string;
  stableKey: string;
  version: number;
  checksum: string;
  kind: string;
  title: string;
  bodyMarkdown: string | null;
  payload: unknown;
};

type ContentStepSnapshot = {
  schemaVersion: '1.0';
  stableKey: string;
  version: number;
  checksum: string;
  kind: string;
  title: string;
  bodyMarkdown: string | null;
  payload: unknown;
};

type PlannedTask = {
  id: string;
  stableKey: string;
  version: number;
  kind: TaskKind;
  purpose: string;
  language: string | null;
  checksum: string;
  required: boolean;
  sequencePosition: number;
};

type SessionContentStepRecord = {
  id: string;
  sequencePosition: number;
  required: boolean;
  snapshot: unknown;
  completedAt: Date | null;
};

function sequenceSnapshotValue(planSnapshot: unknown): Readonly<Record<string, unknown>> | null {
  const sequence = objectValue(objectValue(planSnapshot).sequence);
  return typeof sequence.key === 'string' && typeof sequence.version === 'number' ? sequence : null;
}

function minimumNoHelpSuccesses(planSnapshot: unknown): number {
  const completionRule = objectValue(sequenceSnapshotValue(planSnapshot)?.completionRule);
  return typeof completionRule.minimumNoHelpSuccesses === 'number' &&
    Number.isSafeInteger(completionRule.minimumNoHelpSuccesses) &&
    completionRule.minimumNoHelpSuccesses >= 0
    ? completionRule.minimumNoHelpSuccesses
    : 0;
}

function serializeContentStep(step: SessionContentStepRecord): unknown {
  return {
    kind: 'CONTENT',
    id: step.id,
    position: step.sequencePosition,
    required: step.required,
    completedAt: step.completedAt?.toISOString() ?? null,
    content: objectValue(step.snapshot),
  };
}

@Injectable()
export class SessionsService {
  public constructor(
    private readonly database: PrismaService,
    private readonly recommendations: SessionRecommendationService,
    private readonly mastery: MasteryService,
  ) {}

  public recommendation(): Promise<unknown> {
    return this.recommendations.recommendation();
  }

  public async plan(input: SessionPlanDto): Promise<SessionPlanDto> {
    let topicKeys = [...new Set(input.topicKeys)];
    if (input.returnFromSessionId) {
      const previous = await this.database.client.learningSession.findFirst({
        where: { id: input.returnFromSessionId, userId: DEFAULT_USER_ID },
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: { taskVersion: { include: { task: { include: { topic: true } } } } },
          },
        },
      });
      if (!previous)
        throw notFound('RETURN_SESSION_NOT_FOUND', 'Исходная сессия для возврата не найдена');
      topicKeys = [...new Set(previous.items.map((item) => item.taskVersion.task.topic.key))].slice(
        0,
        3,
      );
      if (topicKeys.length === 0) {
        throw invalidState(
          'RETURN_SESSION_CONTEXT_EMPTY',
          'Исходная сессия не содержит тем для восстановления контекста',
        );
      }
    } else if (topicKeys.length === 0) {
      throw invalidState('SESSION_TOPICS_REQUIRED', 'Выбери хотя бы одну тему для сессии');
    }
    const existing = await this.database.client.topic.findMany({
      where: { key: { in: topicKeys }, status: 'ACTIVE' },
      select: { key: true },
    });
    const existingKeys = new Set(existing.map((topic) => topic.key));
    const unknown = topicKeys.filter((key) => !existingKeys.has(key));
    if (unknown.length > 0) {
      throw notFound('SESSION_TOPIC_NOT_FOUND', `Темы не найдены: ${unknown.join(', ')}`);
    }
    if (input.codeLanguage === 'typescript') {
      const codeTasks = await this.database.client.task.findMany({
        where: {
          kind: 'CODE',
          status: 'ACTIVE',
          topic: { key: { in: topicKeys }, status: 'ACTIVE' },
        },
        select: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: { language: true },
          },
        },
      });
      if (!codeTasks.some((task) => task.versions[0]?.language === 'typescript')) {
        throw invalidState(
          'SESSION_CODE_LANGUAGE_UNAVAILABLE',
          'Для выбранных тем нет активных задач TypeScript; выбери JavaScript',
        );
      }
    }
    const mode = input.returnFromSessionId ? 'RETURN' : input.mode;
    let learningPhase: SessionPlanDto['learningPhase'];
    try {
      const resolved = resolveLearningPhase(mode, input.learningPhase);
      if (resolved === 'CALIBRATION')
        throw new RangeError('Sessions route cannot create assessment');
      learningPhase = resolved;
    } catch {
      throw invalidState(
        'SESSION_LEARNING_PHASE_MISMATCH',
        `LearningPhase ${String(input.learningPhase)} несовместима с режимом ${mode}`,
      );
    }
    if (input.sequenceKey && topicKeys.length !== 1) {
      throw invalidState(
        'SESSION_SEQUENCE_TOPIC_COUNT_INVALID',
        'Explicit sequence можно выбрать только для одной темы',
      );
    }
    if (input.sequenceVersion !== undefined && input.sequenceKey === undefined) {
      throw invalidState(
        'SESSION_SEQUENCE_KEY_REQUIRED',
        'sequenceVersion нельзя выбрать без sequenceKey',
      );
    }
    if (
      input.sequenceVersion !== undefined &&
      (!Number.isSafeInteger(input.sequenceVersion) || input.sequenceVersion < 1)
    ) {
      throw invalidState('SESSION_SEQUENCE_VERSION_INVALID', 'sequenceVersion должна быть >= 1');
    }
    const normalized: SessionPlanDto = {
      mode,
      loadMode: mode === 'RETURN' ? 'RETURN' : input.loadMode,
      topicKeys,
      documentationAllowed: mode === 'INTERVIEW' ? false : input.documentationAllowed,
      codeLanguage: input.codeLanguage,
      learningPhase,
      ...(input.sequenceKey ? { sequenceKey: input.sequenceKey } : {}),
      ...(input.sequenceVersion !== undefined ? { sequenceVersion: input.sequenceVersion } : {}),
      ...(input.returnFromSessionId ? { returnFromSessionId: input.returnFromSessionId } : {}),
    };
    if (normalized.sequenceKey) {
      const selected = await this.selectSequence(normalized);
      normalized.sequenceVersion = selected.snapshot.version;
    }
    return normalized;
  }

  public async create(input: SessionPlanDto): Promise<unknown> {
    const plan = await this.plan(input);
    if (!plan.learningPhase) {
      throw invalidState('SESSION_LEARNING_PHASE_REQUIRED', 'LearningPhase не определена');
    }
    const topics = await this.database.client.topic.findMany({
      where: { key: { in: plan.topicKeys }, status: 'ACTIVE' },
      orderBy: { position: 'asc' },
      include: {
        tasks: {
          where: { status: 'ACTIVE' },
          orderBy: [{ difficulty: 'asc' }, { stableKey: 'asc' }],
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        },
      },
    });
    const versions = topics.flatMap((topic) =>
      topic.tasks.flatMap((task) =>
        task.versions.slice(0, 1).map((version) => ({
          ...version,
          stableKey: task.stableKey,
          kind: task.kind,
          difficulty: task.difficulty,
        })),
      ),
    );
    const sequence = plan.sequenceKey
      ? await this.resolveSequenceReferences(await this.selectSequence(plan))
      : null;
    const legacySelected = sequence === null ? selectSessionTasks(versions, plan) : [];
    const plannedTasks: PlannedTask[] =
      sequence === null
        ? legacySelected.map(({ task, purpose }, sequencePosition) => ({
            id: task.id,
            stableKey: task.stableKey,
            version: task.version,
            kind: task.kind,
            purpose,
            language: task.language,
            checksum: task.checksum,
            required: true,
            sequencePosition,
          }))
        : sequence.steps.flatMap((step) =>
            step.kind === 'TASK'
              ? [
                  {
                    id: step.taskVersionId,
                    stableKey: step.taskKey,
                    version: step.version,
                    kind: step.taskKind,
                    purpose: step.purpose,
                    language: step.language,
                    checksum: step.checksum,
                    required: step.required,
                    sequencePosition: step.sequencePosition,
                  },
                ]
              : [],
          );
    if (plannedTasks.length === 0) {
      throw invalidState(
        'SESSION_CONTENT_EMPTY',
        'Для выбранных тем не импортированы активные задания',
      );
    }
    const mismatchedCode = plannedTasks.find(
      (task) => task.kind === 'CODE' && task.language !== plan.codeLanguage,
    );
    if (mismatchedCode !== undefined) {
      throw invalidState(
        'SESSION_SEQUENCE_CODE_LANGUAGE_MISMATCH',
        `Task ${mismatchedCode.stableKey}@${String(mismatchedCode.version)} не поддерживает ${plan.codeLanguage}`,
      );
    }
    if (sequence === null && plan.mode === 'RETURN' && plannedTasks.length !== 2) {
      throw invalidState(
        'RETURN_SESSION_CONTENT_INSUFFICIENT',
        'Для возврата нужны retrieval-задание и короткое применение',
      );
    }
    const sequenceSnapshot =
      sequence === null
        ? null
        : {
            ...sequence.selected.snapshot,
            blueprintId: sequence.selected.stored.id,
            checksum: sequence.selected.stored.checksum,
            sourcePack: sequence.selected.stored.sourcePack,
            sourceVersion: sequence.selected.stored.sourceVersion,
            steps: sequence.steps,
          };
    const planSnapshot =
      sequenceSnapshot === null
        ? {
            schemaVersion: '1.0',
            request: plan,
            taskVersions: plannedTasks.map((task) => ({
              id: task.id,
              stableKey: task.stableKey,
              version: task.version,
              kind: task.kind,
              purpose: task.purpose,
              language: task.language,
              checksum: task.checksum,
              sequencePosition: task.sequencePosition,
            })),
          }
        : {
            schemaVersion: '2.0',
            request: plan,
            sequence: sequenceSnapshot,
            taskVersions: plannedTasks.map((task) => ({
              id: task.id,
              stableKey: task.stableKey,
              version: task.version,
              kind: task.kind,
              purpose: task.purpose,
              language: task.language,
              checksum: task.checksum,
              required: task.required,
              sequencePosition: task.sequencePosition,
            })),
          };
    const sessionId = await this.database.client.$transaction(async (transaction) => {
      const session = await transaction.learningSession.create({
        data: {
          userId: DEFAULT_USER_ID,
          mode: plan.mode as SessionMode,
          learningPhase: plan.learningPhase as LearningPhase,
          loadMode: plan.loadMode as LoadMode,
          title: topics.map((topic) => topic.title).join(' · '),
          goal:
            plan.mode === 'RETURN'
              ? 'Спокойно восстановить контекст после паузы'
              : `Практика по ${topics.map((topic) => topic.title).join(', ')}`,
          planSnapshot: asJsonInput(planSnapshot),
        },
      });
      if (sequence !== null) {
        for (const step of sequence.steps) {
          if (step.kind !== 'CONTENT') continue;
          await transaction.learningSessionContentStep.create({
            data: {
              sessionId: session.id,
              contentItemId: step.contentItemId,
              sequencePosition: step.sequencePosition,
              required: step.required,
              snapshot: asJsonInput(step.contentSnapshot),
            },
          });
        }
      }
      for (const planned of plannedTasks) {
        const item = await transaction.sessionItem.create({
          data: {
            sessionId: session.id,
            taskVersionId: planned.id,
            position: planned.sequencePosition,
            purpose: planned.purpose,
            required: planned.required,
          },
        });
        await transaction.attempt.create({
          data: {
            userId: DEFAULT_USER_ID,
            sessionId: session.id,
            sessionItemId: item.id,
            taskVersionId: planned.id,
            sequence: 1,
          },
        });
      }
      return session.id;
    });
    return this.get(sessionId);
  }

  public async get(sessionId: string): Promise<unknown> {
    const session = await this.database.client.learningSession.findFirst({
      where: { id: sessionId, userId: DEFAULT_USER_ID },
      include: {
        items: { orderBy: { position: 'asc' }, include: SESSION_ITEM_INCLUDE },
        contentSteps: { orderBy: { sequencePosition: 'asc' } },
      },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Сессия не найдена');
    const request = objectValue(objectValue(session.planSnapshot).request);
    const documentationAllowed = request.documentationAllowed === true;
    const items = session.items.map((item) =>
      serializeTaskItem(
        item,
        undefined,
        false,
        session.mode === 'INTERVIEW' || !documentationAllowed,
      ),
    );
    const orderedSteps: Array<{ position: number; value: unknown }> = [
      ...session.contentSteps.map((step) => ({
        position: step.sequencePosition,
        value: serializeContentStep(step),
      })),
      ...session.items.map((item, index) => ({
        position: item.position,
        value: {
          kind: 'TASK',
          id: item.id,
          position: item.position,
          required: item.required,
          taskItem: items[index],
        },
      })),
    ];
    orderedSteps.sort((left, right) => left.position - right.position);
    return {
      id: session.id,
      title: session.title,
      mode: session.mode,
      learningPhase: session.learningPhase,
      loadMode: session.loadMode,
      status: session.status,
      lastStepLabel: session.lastStepLabel,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      itemCount: session.items.length,
      stepCount: orderedSteps.length,
      goal: session.goal,
      documentationAllowed,
      loadFeedback: session.loadFeedback,
      summary: session.summary,
      sequence: sequenceSnapshotValue(session.planSnapshot),
      items,
      steps: orderedSteps.map((step) => step.value),
    };
  }

  public async start(sessionId: string): Promise<unknown> {
    const session = await this.requireSession(sessionId);
    if (session.status === 'ACTIVE') return this.get(sessionId);
    if (!['DRAFT', 'PAUSED'].includes(session.status)) {
      throw invalidState('SESSION_CANNOT_START', 'Сессию нельзя запустить в текущем состоянии');
    }
    await this.database.client.learningSession.update({
      where: { id: sessionId },
      data: {
        status: RunStatus.ACTIVE,
        startedAt: session.startedAt ?? new Date(),
        pausedAt: null,
      },
    });
    return this.get(sessionId);
  }

  public async pause(sessionId: string): Promise<unknown> {
    const session = await this.requireSession(sessionId);
    if (session.status === 'PAUSED') return this.get(sessionId);
    if (session.status !== 'ACTIVE') {
      throw invalidState('SESSION_NOT_ACTIVE', 'Сессия не находится в активном состоянии');
    }
    await this.database.client.learningSession.update({
      where: { id: sessionId },
      data: { status: RunStatus.PAUSED, pausedAt: new Date() },
    });
    return this.get(sessionId);
  }

  public async completeContentStep(sessionId: string, stepId: string): Promise<unknown> {
    return this.database.client.$transaction(async (transaction) => {
      const step = await transaction.learningSessionContentStep.findFirst({
        where: {
          id: stepId,
          sessionId,
          session: { userId: DEFAULT_USER_ID },
        },
        include: { session: { select: { status: true } } },
      });
      if (!step) {
        throw notFound('SESSION_CONTENT_STEP_NOT_FOUND', 'Content step сессии не найден');
      }
      if (step.session.status !== 'ACTIVE') {
        throw invalidState(
          'SESSION_CONTENT_STEP_NOT_ACTIVE',
          'Content step можно завершить только в активной сессии',
        );
      }
      if (step.completedAt !== null) return serializeContentStep(step);

      const completedAt = new Date();
      const updated = await transaction.learningSessionContentStep.updateMany({
        where: {
          id: step.id,
          completedAt: null,
          session: { userId: DEFAULT_USER_ID, status: RunStatus.ACTIVE },
        },
        data: { completedAt },
      });
      if (updated.count !== 1) {
        const concurrentlyCompleted = await transaction.learningSessionContentStep.findFirst({
          where: {
            id: step.id,
            sessionId,
            completedAt: { not: null },
            session: { userId: DEFAULT_USER_ID },
          },
        });
        if (concurrentlyCompleted) return serializeContentStep(concurrentlyCompleted);
        throw invalidState(
          'SESSION_CONTENT_STEP_NOT_ACTIVE',
          'Сессия изменила состояние до завершения content step',
        );
      }
      return serializeContentStep({ ...step, completedAt });
    });
  }

  public async complete(sessionId: string, input: CompleteSessionDto): Promise<unknown> {
    const session = await this.database.client.learningSession.findFirst({
      where: { id: sessionId, userId: DEFAULT_USER_ID },
      include: {
        contentSteps: { select: { required: true, completedAt: true } },
        items: {
          include: {
            attempts: {
              orderBy: { sequence: 'desc' },
              take: 1,
              include: {
                evaluations: {
                  where: { supersededBy: null },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { passed: true },
                },
              },
            },
            taskVersion: { include: { task: { select: { topicId: true } } } },
          },
        },
      },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Сессия не найдена');
    if (session.status === 'COMPLETED') return this.get(sessionId);
    if (!['ACTIVE', 'PAUSED'].includes(session.status)) {
      throw invalidState('SESSION_NOT_ACTIVE', 'Сессия не находится в активном состоянии');
    }
    const incompleteContent = session.contentSteps.filter(
      (step) => step.required && step.completedAt === null,
    );
    if (incompleteContent.length > 0) {
      throw invalidState(
        'SESSION_CONTENT_INCOMPLETE',
        'Сначала отметь изученными обязательные content steps',
      );
    }
    const incomplete = session.items.filter(
      (item) => item.required && !item.attempts[0]?.submittedAt,
    );
    if (incomplete.length > 0) {
      throw invalidState('SESSION_INCOMPLETE', 'Сначала отправь обязательные ответы сессии');
    }
    const requiredNoHelpSuccesses = minimumNoHelpSuccesses(session.planSnapshot);
    const noHelpSuccesses = session.items.filter((item) => {
      const attempt = item.attempts[0];
      return (
        attempt?.submittedAt !== null &&
        attempt?.submittedAt !== undefined &&
        attempt.helpLevel === 'NONE' &&
        attempt.evaluations[0]?.passed === true
      );
    }).length;
    if (noHelpSuccesses < requiredNoHelpSuccesses) {
      throw invalidState(
        'SESSION_COMPLETION_RULE_NOT_MET',
        `Нужно успешных ответов без подсказки: ${String(requiredNoHelpSuccesses)}; сейчас ${String(noHelpSuccesses)}`,
      );
    }
    const now = new Date();
    const durationSec = session.startedAt
      ? Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 1_000))
      : 0;
    await this.database.client.$transaction(async (transaction) => {
      await transaction.learningSession.update({
        where: { id: sessionId },
        data: {
          status: RunStatus.COMPLETED,
          completedAt: now,
          pausedAt: null,
          durationSec,
          loadFeedback: input.loadFeedback,
          summary: input.summary?.trim() || null,
          lastStepLabel: 'Сессия завершена',
        },
      });
      if (input.loadFeedback === 'HARD' || input.loadFeedback === 'OVERLOAD') {
        await this.mastery.recomputeWithin(
          transaction,
          session.items.map((item) => item.taskVersion.task.topicId),
          { overloaded: true },
        );
      }
    });
    return this.get(sessionId);
  }

  public async history(query: SessionListQueryDto): Promise<unknown[]> {
    const sessions = await this.database.client.learningSession.findMany({
      where: {
        userId: DEFAULT_USER_ID,
        mode: { not: 'ASSESSMENT' },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { id: 'desc' },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit ?? 50,
      include: { _count: { select: { items: true, contentSteps: true } } },
    });
    return sessions.map((session) => ({
      id: session.id,
      title: session.title,
      mode: session.mode,
      loadMode: session.loadMode,
      status: session.status,
      lastStepLabel: session.lastStepLabel,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      itemCount: session._count.items,
      stepCount: session._count.items + session._count.contentSteps,
      learningPhase: session.learningPhase,
      sequence: sequenceSnapshotValue(session.planSnapshot),
    }));
  }

  private async selectSequence(plan: SessionPlanDto): Promise<SelectedLearningSequence> {
    const topicKey = plan.topicKeys[0];
    if (!plan.sequenceKey || !plan.learningPhase || topicKey === undefined) {
      throw invalidState(
        'SESSION_SEQUENCE_REQUEST_INVALID',
        'Для sequence нужны одна тема, sequenceKey и LearningPhase',
      );
    }
    const storedRows = await this.database.client.learningSequenceBlueprint.findMany({
      where: {
        key: plan.sequenceKey,
        phase: plan.learningPhase,
        topic: { key: topicKey, status: 'ACTIVE' },
        ...(plan.sequenceVersion === undefined ? {} : { version: plan.sequenceVersion }),
      },
      orderBy: { version: 'desc' },
      include: { topic: { select: { key: true } } },
    });
    if (storedRows.length === 0) {
      throw notFound(
        'SESSION_SEQUENCE_NOT_FOUND',
        `Sequence ${plan.sequenceKey} для ${topicKey}/${plan.learningPhase} не найдена`,
      );
    }
    const [activeSources, activeTaskVersions, activeContentItems] = await Promise.all([
      this.database.client.contentPack.findMany({
        where: {
          status: 'ACTIVE',
          OR: storedRows.map((row) => ({ key: row.sourcePack, version: row.sourceVersion })),
        },
        select: { key: true, version: true },
      }),
      this.database.client.taskVersion.findMany({
        where: { task: { status: 'ACTIVE', topic: { key: topicKey, status: 'ACTIVE' } } },
        select: {
          version: true,
          sourcePack: true,
          sourceVersion: true,
          task: { select: { stableKey: true } },
        },
      }),
      this.database.client.contentItem.findMany({
        where: { status: 'ACTIVE', topic: { key: topicKey, status: 'ACTIVE' } },
        select: {
          stableKey: true,
          version: true,
          sourcePack: true,
          sourceVersion: true,
        },
      }),
    ]);
    const stored = filterLearningSequencesByAvailableReferences(
      filterLearningSequencesByActiveSource(
        storedRows.map(
          (row): StoredLearningSequenceBlueprint => ({
            id: row.id,
            key: row.key,
            version: row.version,
            topicKey: row.topic.key,
            schemaVersion: row.schemaVersion,
            phase: row.phase,
            estimatedMinutes: row.estimatedMinutes,
            steps: row.steps,
            completionRule: row.completionRule,
            checksum: row.checksum,
            sourcePack: row.sourcePack,
            sourceVersion: row.sourceVersion,
          }),
        ),
        activeSources,
      ),
      {
        taskVersions: activeTaskVersions.map((version) => ({
          stableKey: version.task.stableKey,
          version: version.version,
          sourcePack: version.sourcePack,
          sourceVersion: version.sourceVersion,
        })),
        contentItems: activeContentItems,
      },
    );
    if (stored.length === 0) {
      throw notFound(
        'SESSION_SEQUENCE_NOT_FOUND',
        `Sequence ${plan.sequenceKey} для ${topicKey}/${plan.learningPhase} не найдена`,
      );
    }
    try {
      const selected = selectStoredLearningSequence(stored, {
        topicKey,
        phase: plan.learningPhase,
        loadMode: plan.loadMode,
        recentSequenceKeys: [],
        recommendedSequenceKey: plan.sequenceKey,
      });
      if (selected !== null) return selected;
    } catch {
      throw invalidState(
        'SESSION_SEQUENCE_INVALID',
        `Sequence ${plan.sequenceKey} не соответствует learning sequence contract`,
      );
    }
    throw notFound(
      'SESSION_SEQUENCE_NOT_FOUND',
      `Sequence ${plan.sequenceKey} для ${topicKey}/${plan.learningPhase} не найдена`,
    );
  }

  private async resolveSequenceReferences(
    selected: SelectedLearningSequence,
  ): Promise<ResolvedSequence> {
    const taskSteps = selected.snapshot.steps.filter((step) => step.kind === 'TASK');
    const contentSteps = selected.snapshot.steps.filter((step) => step.kind === 'CONTENT');
    const seenTasks = new Set<string>();
    const duplicateTasks = new Set<string>();
    for (const step of taskSteps) {
      const key = `${step.taskKey}@${String(step.version)}`;
      if (seenTasks.has(key)) duplicateTasks.add(key);
      seenTasks.add(key);
    }
    if (duplicateTasks.size > 0) {
      throw invalidState(
        'SESSION_SEQUENCE_DUPLICATE_TASK',
        `Sequence содержит повторные task refs: ${[...duplicateTasks].join(', ')}`,
      );
    }
    const taskVersions: TaskReference[] =
      taskSteps.length === 0
        ? []
        : await this.database.client.taskVersion.findMany({
            where: {
              OR: taskSteps.map((step) => ({
                version: step.version,
                task: { stableKey: step.taskKey },
              })),
              sourcePack: selected.stored.sourcePack,
              sourceVersion: selected.stored.sourceVersion,
              task: {
                status: 'ACTIVE',
                topic: { key: selected.snapshot.topicKey, status: 'ACTIVE' },
              },
            },
            select: {
              id: true,
              version: true,
              checksum: true,
              language: true,
              task: { select: { stableKey: true, kind: true } },
            },
          });
    const contentItems: ContentReference[] =
      contentSteps.length === 0
        ? []
        : await this.database.client.contentItem.findMany({
            where: {
              OR: contentSteps.map((step) => ({
                stableKey: step.contentItemKey,
                version: step.version,
              })),
              sourcePack: selected.stored.sourcePack,
              sourceVersion: selected.stored.sourceVersion,
              status: 'ACTIVE',
              topic: { key: selected.snapshot.topicKey, status: 'ACTIVE' },
            },
            select: {
              id: true,
              stableKey: true,
              version: true,
              checksum: true,
              kind: true,
              title: true,
              bodyMarkdown: true,
              payload: true,
            },
          });
    const taskByRef = new Map(
      taskVersions.map((version) => [
        `${version.task.stableKey}@${String(version.version)}`,
        version,
      ]),
    );
    const contentByRef = new Map(
      contentItems.map((item) => [`${item.stableKey}@${String(item.version)}`, item]),
    );
    const missingTasks = taskSteps
      .map((step) => `${step.taskKey}@${String(step.version)}`)
      .filter((key) => !taskByRef.has(key));
    if (missingTasks.length > 0) {
      throw notFound(
        'SESSION_SEQUENCE_TASK_NOT_FOUND',
        `TaskVersion refs из sequence не найдены: ${missingTasks.join(', ')}`,
      );
    }
    const missingContent = contentSteps
      .map((step) => `${step.contentItemKey}@${String(step.version)}`)
      .filter((key) => !contentByRef.has(key));
    if (missingContent.length > 0) {
      throw notFound(
        'SESSION_SEQUENCE_CONTENT_NOT_FOUND',
        `Content refs из sequence не найдены: ${missingContent.join(', ')}`,
      );
    }
    const requiredSteps = selected.snapshot.completionRule.requiredSteps;
    const steps: ResolvedSequenceStep[] = selected.snapshot.steps.map((step, sequencePosition) => {
      const required = sequencePosition < requiredSteps;
      if (step.kind === 'CONTENT') {
        const item = contentByRef.get(`${step.contentItemKey}@${String(step.version)}`);
        if (item === undefined) throw new Error('Resolved content ref disappeared');
        return {
          ...step,
          sequencePosition,
          required,
          contentItemId: item.id,
          checksum: item.checksum,
          contentSnapshot: {
            schemaVersion: '1.0',
            stableKey: item.stableKey,
            version: item.version,
            checksum: item.checksum,
            kind: item.kind,
            title: item.title,
            bodyMarkdown: item.bodyMarkdown,
            payload: item.payload,
          },
        };
      }
      const version = taskByRef.get(`${step.taskKey}@${String(step.version)}`);
      if (version === undefined) throw new Error('Resolved task ref disappeared');
      return {
        ...step,
        sequencePosition,
        required,
        taskVersionId: version.id,
        checksum: version.checksum,
        taskKind: version.task.kind,
        language: version.language,
      };
    });
    if (!steps.some((step) => step.kind === 'TASK')) {
      throw invalidState(
        'SESSION_SEQUENCE_TASKS_EMPTY',
        'Sequence не содержит TASK steps, которые поддерживает текущий session runner',
      );
    }
    return { selected, steps };
  }

  private async requireSession(sessionId: string) {
    const session = await this.database.client.learningSession.findFirst({
      where: { id: sessionId, userId: DEFAULT_USER_ID },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Сессия не найдена');
    return session;
  }
}
