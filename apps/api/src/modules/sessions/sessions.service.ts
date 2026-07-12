import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID, LoadMode, RunStatus, SessionMode } from '@skillforge/db';

import { invalidState, notFound } from '../../common/api-error.js';
import { asJsonInput, objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SESSION_ITEM_INCLUDE, serializeTaskItem } from '../learning/task-view.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { SessionRecommendationService } from './session-recommendation.service.js';
import { selectSessionTasks } from './session-planner.js';
import type { CompleteSessionDto, SessionListQueryDto, SessionPlanDto } from './sessions.dto.js';

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
    return {
      mode,
      loadMode: mode === 'RETURN' ? 'RETURN' : input.loadMode,
      topicKeys,
      documentationAllowed: mode === 'INTERVIEW' ? false : input.documentationAllowed,
      codeLanguage: input.codeLanguage,
      ...(input.returnFromSessionId ? { returnFromSessionId: input.returnFromSessionId } : {}),
    };
  }

  public async create(input: SessionPlanDto): Promise<unknown> {
    const plan = await this.plan(input);
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
    const selected = selectSessionTasks(versions, plan);
    if (selected.length === 0) {
      throw invalidState(
        'SESSION_CONTENT_EMPTY',
        'Для выбранных тем не импортированы активные задания',
      );
    }
    if (plan.mode === 'RETURN' && selected.length !== 2) {
      throw invalidState(
        'RETURN_SESSION_CONTENT_INSUFFICIENT',
        'Для возврата нужны retrieval-задание и короткое применение',
      );
    }
    const sessionId = await this.database.client.$transaction(async (transaction) => {
      const session = await transaction.learningSession.create({
        data: {
          userId: DEFAULT_USER_ID,
          mode: plan.mode as SessionMode,
          loadMode: plan.loadMode as LoadMode,
          title: topics.map((topic) => topic.title).join(' · '),
          goal:
            plan.mode === 'RETURN'
              ? 'Спокойно восстановить контекст после паузы'
              : `Практика по ${topics.map((topic) => topic.title).join(', ')}`,
          planSnapshot: asJsonInput({
            schemaVersion: '1.0',
            request: plan,
            taskVersions: selected.map(({ task, purpose }) => ({
              id: task.id,
              version: task.version,
              kind: task.kind,
              purpose,
              language: task.language,
            })),
          }),
        },
      });
      for (const [position, planned] of selected.entries()) {
        const item = await transaction.sessionItem.create({
          data: {
            sessionId: session.id,
            taskVersionId: planned.task.id,
            position,
            purpose: planned.purpose,
            required: true,
          },
        });
        await transaction.attempt.create({
          data: {
            userId: DEFAULT_USER_ID,
            sessionId: session.id,
            sessionItemId: item.id,
            taskVersionId: planned.task.id,
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
      include: { items: { orderBy: { position: 'asc' }, include: SESSION_ITEM_INCLUDE } },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Сессия не найдена');
    const request = objectValue(objectValue(session.planSnapshot).request);
    const documentationAllowed = request.documentationAllowed === true;
    return {
      id: session.id,
      title: session.title,
      mode: session.mode,
      loadMode: session.loadMode,
      status: session.status,
      lastStepLabel: session.lastStepLabel,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      itemCount: session.items.length,
      goal: session.goal,
      documentationAllowed,
      loadFeedback: session.loadFeedback,
      summary: session.summary,
      items: session.items.map((item) =>
        serializeTaskItem(
          item,
          undefined,
          false,
          session.mode === 'INTERVIEW' || !documentationAllowed,
        ),
      ),
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

  public async complete(sessionId: string, input: CompleteSessionDto): Promise<unknown> {
    const session = await this.database.client.learningSession.findFirst({
      where: { id: sessionId, userId: DEFAULT_USER_ID },
      include: {
        items: {
          include: {
            attempts: { orderBy: { sequence: 'desc' }, take: 1 },
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
    const incomplete = session.items.filter(
      (item) => item.required && !item.attempts[0]?.submittedAt,
    );
    if (incomplete.length > 0) {
      throw invalidState('SESSION_INCOMPLETE', 'Сначала отправь обязательные ответы сессии');
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
      include: { _count: { select: { items: true } } },
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
    }));
  }

  private async requireSession(sessionId: string) {
    const session = await this.database.client.learningSession.findFirst({
      where: { id: sessionId, userId: DEFAULT_USER_ID },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Сессия не найдена');
    return session;
  }
}
