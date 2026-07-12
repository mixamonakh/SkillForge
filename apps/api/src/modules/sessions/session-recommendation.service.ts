import { Injectable } from '@nestjs/common';
import { DEFAULT_USER_ID } from '@skillforge/db';
import { recommendPrimarySession, type RecommendationCandidate } from '@skillforge/learning-engine';

import { objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';

function weakness(status: string, estimate: number | null): number {
  if (status === 'UNKNOWN') return 70;
  if (status === 'WEAK') return 100;
  if (status === 'UNSTABLE') return 70;
  if (status === 'SOLID') return Math.max(0, 60 - (estimate ?? 50));
  return 0;
}

function daysSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

export type MisconceptionOccurrence = {
  misconceptionId: string;
  topicIds: readonly string[];
};

export function repeatedMistakeScores(
  occurrences: readonly MisconceptionOccurrence[],
): ReadonlyMap<string, number> {
  const countsByTopic = new Map<string, Map<string, number>>();
  for (const occurrence of occurrences) {
    for (const topicId of new Set(occurrence.topicIds)) {
      const topicCounts = countsByTopic.get(topicId) ?? new Map<string, number>();
      topicCounts.set(
        occurrence.misconceptionId,
        (topicCounts.get(occurrence.misconceptionId) ?? 0) + 1,
      );
      countsByTopic.set(topicId, topicCounts);
    }
  }
  return new Map(
    [...countsByTopic].map(([topicId, counts]) => {
      const maximumRepeatedCount = Math.max(0, ...counts.values());
      return [topicId, maximumRepeatedCount >= 2 ? Math.min(100, maximumRepeatedCount * 25) : 0];
    }),
  );
}

@Injectable()
export class SessionRecommendationService {
  public constructor(
    private readonly database: PrismaService,
    private readonly curriculum: CurriculumService,
  ) {}

  public async recommendation(): Promise<unknown> {
    const [topics, lastSession, settings, misconceptionFindings] = await Promise.all([
      this.database.client.topic.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ track: { position: 'asc' } }, { position: 'asc' }],
        include: {
          topicStates: { where: { userId: DEFAULT_USER_ID }, take: 1 },
          prerequisites: {
            include: {
              prerequisite: { include: { topicStates: { where: { userId: DEFAULT_USER_ID } } } },
            },
          },
          _count: { select: { dependents: true } },
        },
      }),
      this.database.client.learningSession.findFirst({
        where: { userId: DEFAULT_USER_ID, mode: { not: 'ASSESSMENT' } },
        orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
      }),
      this.database.client.userSettings.findUnique({ where: { userId: DEFAULT_USER_ID } }),
      this.database.client.evaluationMisconception.findMany({
        where: { evaluation: { userId: DEFAULT_USER_ID, supersededBy: null } },
        select: {
          misconceptionId: true,
          evaluation: { select: { evidence: { select: { topicId: true } } } },
        },
      }),
    ]);
    const mistakeScores = repeatedMistakeScores(
      misconceptionFindings.map((finding) => ({
        misconceptionId: finding.misconceptionId,
        topicIds: finding.evaluation.evidence.map((evidence) => evidence.topicId),
      })),
    );
    const candidates: RecommendationCandidate[] = topics.map((topic) => {
      const state = topic.topicStates[0];
      const metadata = objectValue(topic.metadata);
      const relevance = typeof metadata.yandexRelevance === 'number' ? metadata.yandexRelevance : 0;
      const prerequisitesMet = topic.prerequisites.every(({ prerequisite }) => {
        const status = prerequisite.topicStates[0]?.status ?? 'UNKNOWN';
        return status === 'SOLID' || status === 'MASTERED';
      });
      const repeatedMistakeScore = mistakeScores.get(topic.id) ?? 0;
      return {
        topicKey: topic.key,
        sessionMode: state?.needsReview ? 'REVIEW' : 'TRAINING',
        targetWeight: relevance * 20,
        weaknessScore: weakness(state?.status ?? 'UNKNOWN', state?.masteryEstimate ?? null),
        prerequisiteUnlockValue: Math.min(100, topic._count.dependents * 20),
        reviewDueScore: state?.needsReview ? 100 : 0,
        repeatedMistakeScore,
        criticalPrerequisitesMet: prerequisitesMet,
        reason:
          repeatedMistakeScore > 0
            ? 'По теме повторяется подтверждённое misconception; приоритетна целевая практика.'
            : state?.status === 'UNKNOWN'
              ? 'По теме пока недостаточно evidence; короткая практика добавит калибровку.'
              : state?.needsReview === true
                ? 'Тема готова к повторению; её mastery-статус не понижен.'
                : 'Тема имеет высокий приоритет по target relevance и текущим evidence.',
      };
    });
    const recommendation = recommendPrimarySession(candidates, {
      selectedLoadMode: settings?.defaultLoadMode ?? 'NORMAL',
      loadFeedback: lastSession?.loadFeedback ?? null,
      daysSinceLastSession: daysSince(lastSession?.completedAt ?? lastSession?.pausedAt ?? null),
      resumeThresholdDays: settings?.resumeThresholdDays ?? 7,
    });
    if (!recommendation) {
      return {
        topic: null,
        mode: 'TRAINING',
        loadMode: settings?.defaultLoadMode ?? 'NORMAL',
        reason: 'Нет доступной темы с выполненными prerequisite.',
      };
    }
    const topic = (await this.curriculum.topics({})).find(
      (item) => objectValue(item).key === recommendation.topicKey,
    );
    return {
      topic: topic ?? null,
      mode: recommendation.sessionMode,
      loadMode: recommendation.loadMode,
      reason: recommendation.reason,
    };
  }
}
