import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID } from '@skillforge/db';

import { objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { MetricsReadService } from './metrics-read.service.js';
import { sufficiency, topicRelevance } from './metrics-utils.js';

@Injectable()
export class MetricsService {
  public constructor(
    private readonly database: PrismaService,
    private readonly sessions: SessionsService,
    private readonly reads: MetricsReadService,
  ) {}

  public async dashboard(): Promise<unknown> {
    const [topics, states, activeAssessment, lastSession, lastImport, settings] = await Promise.all(
      [
        this.database.client.topic.findMany({
          where: { status: 'ACTIVE' },
          include: { track: true },
        }),
        this.database.client.topicState.findMany({
          where: { userId: DEFAULT_USER_ID },
          include: { topic: { include: { track: true } } },
        }),
        this.database.client.assessmentRun.findFirst({
          where: { userId: DEFAULT_USER_ID, status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] } },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          include: {
            session: { include: { attempts: { select: { submittedAt: true } } } },
            blueprint: { include: { _count: { select: { items: true } } } },
          },
        }),
        this.database.client.learningSession.findFirst({
          where: { userId: DEFAULT_USER_ID, mode: { not: 'ASSESSMENT' } },
          orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
          include: {
            items: {
              orderBy: { position: 'desc' },
              take: 1,
              include: { taskVersion: { include: { task: { include: { topic: true } } } } },
            },
          },
        }),
        this.database.client.importBatch.findFirst({
          where: { userId: DEFAULT_USER_ID, status: 'APPLIED' },
          orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
        }),
        this.database.client.userSettings.findUnique({ where: { userId: DEFAULT_USER_ID } }),
      ],
    );
    const assessedStates = states.filter((state) => state.status !== 'UNKNOWN');
    const stateByTopic = new Map(states.map((state) => [state.topicId, state]));
    const priority = [...topics]
      .filter((topic) => ['WEAK', 'UNSTABLE'].includes(stateByTopic.get(topic.id)?.status ?? ''))
      .sort(
        (left, right) =>
          topicRelevance(right.metadata) - topicRelevance(left.metadata) ||
          (stateByTopic.get(left.id)?.masteryEstimate ?? 100) -
            (stateByTopic.get(right.id)?.masteryEstimate ?? 100),
      )[0];
    const dueReviews = states
      .filter((state) => state.needsReview)
      .sort(
        (left, right) => (left.nextReviewAt?.getTime() ?? 0) - (right.nextReviewAt?.getTime() ?? 0),
      )
      .slice(0, 3)
      .map((state) => ({ key: state.topic.key, title: state.topic.title, status: state.status }));
    const recommendation = activeAssessment
      ? {
          title: 'Продолжить диагностику JavaScript',
          reason: 'Run snapshot и сохранённые ответы готовы к продолжению с текущей позиции.',
          href: `/assessment/${activeAssessment.id}`,
          action: 'Продолжить',
        }
      : await this.dashboardRecommendation();
    const lastAt =
      lastSession?.completedAt ?? lastSession?.pausedAt ?? lastSession?.startedAt ?? null;
    const pausedDays = lastAt ? Math.floor((Date.now() - lastAt.getTime()) / 86_400_000) : 0;
    const threshold = settings?.resumeThresholdDays ?? 7;
    const resume =
      !activeAssessment && lastSession && pausedDays >= threshold
        ? {
            sessionId: lastSession.id,
            topic: lastSession.items[0]?.taskVersion.task.topic.title ?? lastSession.title,
            step: lastSession.lastStepLabel,
            pausedDays,
          }
        : null;
    const normalizedImport = objectValue(lastImport?.normalized);
    return {
      calibrated: assessedStates.length > 0,
      dataSufficiency: sufficiency(assessedStates.length, topics.length),
      activeAssessment: activeAssessment
        ? {
            id: activeAssessment.id,
            status: activeAssessment.status,
            answered:
              activeAssessment.session?.attempts.filter((attempt) => attempt.submittedAt !== null)
                .length ?? 0,
            total: activeAssessment.blueprint._count.items,
          }
        : null,
      recommendation: resume ? null : recommendation,
      coverage: { assessed: assessedStates.length, total: topics.length },
      priorityTopic: priority
        ? {
            key: priority.key,
            title: priority.title,
            status: stateByTopic.get(priority.id)?.status ?? 'UNKNOWN',
          }
        : null,
      dueReviews,
      lastSession: lastSession
        ? {
            id: lastSession.id,
            title: lastSession.title,
            lastStepLabel: lastSession.lastStepLabel,
            at: (lastAt ?? new Date()).toISOString(),
          }
        : null,
      lastImport: lastImport
        ? {
            id: lastImport.id,
            appliedAt: lastImport.appliedAt?.toISOString() ?? null,
            summary:
              typeof normalizedImport.summary === 'string'
                ? normalizedImport.summary
                : 'Внешний анализ применён как advisory evidence.',
          }
        : null,
      resume,
    };
  }

  private async dashboardRecommendation(): Promise<unknown> {
    const recommendation = objectValue(await this.sessions.recommendation());
    const topic = objectValue(recommendation.topic);
    if (typeof topic.key !== 'string' || typeof topic.title !== 'string') return null;
    const mode = typeof recommendation.mode === 'string' ? recommendation.mode : 'TRAINING';
    return {
      title: `${mode === 'RETURN' ? 'Восстановить' : 'Практика'}: ${topic.title}`,
      reason:
        typeof recommendation.reason === 'string'
          ? recommendation.reason
          : 'Следующая сессия рассчитана по evidence.',
      href: `/sessions?topic=${encodeURIComponent(topic.key)}`,
      action: mode === 'RETURN' ? 'Восстановить контекст' : 'Собрать сессию',
    };
  }

  public async topicsMetrics(): Promise<unknown> {
    const [
      tracks,
      topics,
      states,
      pendingExternalReviews,
      calibration,
      misconceptions,
      feedback,
      readiness,
    ] = await Promise.all([
      this.database.client.track.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { position: 'asc' },
        include: { topics: { where: { status: 'ACTIVE' }, select: { id: true } } },
      }),
      this.database.client.topic.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
      this.database.client.topicState.findMany({ where: { userId: DEFAULT_USER_ID } }),
      this.database.client.attempt.count({
        where: {
          userId: DEFAULT_USER_ID,
          submittedAt: { not: null },
          taskVersion: {
            task: {
              kind: {
                in: ['EXPLAIN', 'PREDICT_OUTPUT', 'FIND_BUG', 'COMPARE_SOLUTIONS', 'AI_REVIEW'],
              },
            },
          },
          evaluations: { none: { evaluatorType: { in: ['EXTERNAL_AI', 'MANUAL'] } } },
        },
      }),
      this.reads.calibration(),
      this.reads.misconceptions(),
      this.database.client.learningSession.groupBy({
        by: ['loadFeedback'],
        where: { userId: DEFAULT_USER_ID, loadFeedback: { not: null } },
        _count: { _all: true },
      }),
      this.reads.readiness(),
    ]);
    const stateByTopic = new Map(states.map((state) => [state.topicId, state]));
    const masteryDistribution = {
      UNKNOWN: topics.filter(
        (topic) => (stateByTopic.get(topic.id)?.status ?? 'UNKNOWN') === 'UNKNOWN',
      ).length,
      WEAK: states.filter((state) => state.status === 'WEAK').length,
      UNSTABLE: states.filter((state) => state.status === 'UNSTABLE').length,
      SOLID: states.filter((state) => state.status === 'SOLID').length,
      MASTERED: states.filter((state) => state.status === 'MASTERED').length,
    };
    const assessed = states.filter((state) => state.status !== 'UNKNOWN').length;
    const readinessRecord = objectValue(readiness);
    const readinessData = objectValue(readinessRecord.dataSufficiency);
    return {
      dataSufficiency: sufficiency(assessed, topics.length),
      coverage: tracks.map((track) => ({
        trackKey: track.key,
        title: track.title,
        assessed: track.topics.filter(
          (topic) => (stateByTopic.get(topic.id)?.status ?? 'UNKNOWN') !== 'UNKNOWN',
        ).length,
        total: track.topics.length,
      })),
      masteryDistribution,
      freshness: {
        fresh: states.filter((state) => state.evidenceCount > 0 && !state.needsReview).length,
        reviewDue: states.filter((state) => state.needsReview).length,
        noEvidence: topics.length - states.filter((state) => state.evidenceCount > 0).length,
      },
      pendingExternalReviews,
      calibration,
      misconceptions,
      loadFeedback: Object.fromEntries(
        feedback.flatMap((item) =>
          item.loadFeedback ? [[item.loadFeedback, item._count._all] as const] : [],
        ),
      ),
      readiness: {
        dataSufficiency: readinessData,
        value: typeof readinessRecord.value === 'number' ? readinessRecord.value : null,
        targetTitle:
          typeof readinessRecord.targetTitle === 'string'
            ? readinessRecord.targetTitle
            : 'Yandex / Strong Company Track',
        targetVersion:
          typeof readinessRecord.targetVersion === 'string' ? readinessRecord.targetVersion : '1',
        covered: typeof readinessRecord.covered === 'number' ? readinessRecord.covered : 0,
        required: typeof readinessRecord.required === 'number' ? readinessRecord.required : 0,
        gates: Array.isArray(readinessRecord.gates) ? readinessRecord.gates : [],
      },
    };
  }

  public async readiness(targetKey?: string): Promise<unknown> {
    return this.reads.readiness(targetKey);
  }

  public calibration(): Promise<unknown> {
    return this.reads.calibration();
  }

  public misconceptions(): Promise<Array<{ key: string; title: string; count: number }>> {
    return this.reads.misconceptions();
  }
}
