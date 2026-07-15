import { Injectable } from '@nestjs/common';
import type { LoadMode } from '@skillforge/contracts';
import { DEFAULT_USER_ID } from '@skillforge/db';
import {
  CAPABILITY_FAMILIES,
  recommendNextV2,
  recommendPrimarySession,
  type CapabilityFamily,
  type CapabilityState,
  type LearningPhase,
  type RecommendationCandidate,
  type RecommendationV2Candidate,
  type TopicCapabilityProfile,
} from '@skillforge/learning-engine';

import { invalidState } from '../../common/api-error.js';
import { objectValue } from '../../common/json.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CapabilityProjectionService } from '../capability/capability-projection.service.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import {
  filterLearningSequencesByAvailableReferences,
  filterLearningSequencesByActiveSource,
  recentSequenceKey,
  selectStoredLearningSequence,
  type StoredLearningSequenceBlueprint,
} from './session-sequence.js';

const capabilityLabels: Readonly<Record<CapabilityFamily, string>> = Object.freeze({
  TERM: 'терминология',
  MECHANISM: 'понимание механизма',
  TRACE: 'чтение хода выполнения',
  DEBUG: 'отладка',
  CODE_PRODUCTION: 'самостоятельный код',
  TRANSFER: 'перенос в рабочую задачу',
  CALIBRATION: 'калибровка',
});

const coveragePriority = Object.freeze({ NOT_TESTED: 0, INSUFFICIENT: 1, SUFFICIENT: 2 });

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

function isOverloadFeedback(feedback: string | null | undefined): boolean {
  return feedback === 'HARD' || feedback === 'OVERLOAD';
}

function estimatedMinutes(loadMode: LoadMode): number {
  if (loadMode === 'MINIMAL') return 25;
  if (loadMode === 'DEEP') return 80;
  if (loadMode === 'RETURN') return 20;
  return 50;
}

function capabilitySlug(family: CapabilityFamily): string {
  return family.toLowerCase().replaceAll('_', '-');
}

export function primaryCapabilityGap(profile: TopicCapabilityProfile): CapabilityState {
  const ranked = CAPABILITY_FAMILIES.filter((family) => family !== 'CALIBRATION')
    .map((family) => profile.capabilities[family])
    .sort(
      (left, right) =>
        coveragePriority[left.coverage] - coveragePriority[right.coverage] ||
        (left.estimate ?? 101) - (right.estimate ?? 101) ||
        left.confidence - right.confidence ||
        CAPABILITY_FAMILIES.indexOf(left.family) - CAPABILITY_FAMILIES.indexOf(right.family),
    );
  const primary = ranked[0];
  if (primary === undefined) throw new Error('Capability profile has no learning capability');
  return primary;
}

export function recommendationLearningPhase(input: {
  status: string;
  needsReview: boolean;
  returnDue: boolean;
}): Exclude<LearningPhase, 'CALIBRATION'> {
  if (input.returnDue || input.needsReview) return 'CONSOLIDATION';
  if (input.status === 'SOLID' || input.status === 'MASTERED') return 'TRANSFER';
  return 'ACQUISITION';
}

function completionTarget(phase: Exclude<LearningPhase, 'CALIBRATION'>): string {
  if (phase === 'CONSOLIDATION') {
    return 'Завершить sequence и подтвердить capability повторным ответом без подсказки.';
  }
  if (phase === 'TRANSFER') {
    return 'Завершить sequence и получить самостоятельное transfer evidence.';
  }
  return 'Завершить sequence и получить минимум один успешный ответ без подсказки.';
}

function evidenceNeeded(state: CapabilityState): string[] {
  const label = capabilityLabels[state.family];
  if (state.coverage === 'NOT_TESTED') return [`Первое явно сопоставленное evidence: ${label}`];
  if (state.coverage === 'INSUFFICIENT') return [`Ещё одно независимое evidence: ${label}`];
  if (state.noHelpSuccessCount === 0) return [`Успешное evidence без подсказки: ${label}`];
  return [`Delayed или transfer evidence: ${label}`];
}

function gapSeverity(state: CapabilityState): number {
  if (state.coverage === 'NOT_TESTED') return 70;
  if (state.coverage === 'INSUFFICIENT') return 65;
  return Math.max(0, 100 - (state.estimate ?? 100));
}

export type RecommendationV2TopicInput = {
  key: string;
  title: string;
  status: string;
  needsReview: boolean;
  criticalPrerequisitesMet: boolean;
  prerequisiteUnlock: number;
  targetRelevance: number;
  repeatedMistakeScore: number;
  recentExposureCount: number;
  profile: TopicCapabilityProfile;
};

export function recommendationCandidateForTopic(
  topic: RecommendationV2TopicInput,
  context: { loadMode: LoadMode; returnDue: boolean },
): RecommendationV2Candidate {
  const gap = primaryCapabilityGap(topic.profile);
  const phase = recommendationLearningPhase({
    status: topic.status,
    needsReview: topic.needsReview,
    returnDue: context.returnDue,
  });
  const familyKey = `${topic.key}.${capabilitySlug(gap.family)}`;
  const reason =
    topic.repeatedMistakeScore > 0
      ? `По теме повторяется подтверждённое misconception; нужна целевая практика capability «${capabilityLabels[gap.family]}».`
      : gap.coverage === 'NOT_TESTED'
        ? `По capability «${capabilityLabels[gap.family]}» пока нет явно сопоставленного evidence.`
        : gap.coverage === 'INSUFFICIENT'
          ? `Evidence по capability «${capabilityLabels[gap.family]}» пока недостаточно для устойчивого маршрута.`
          : `Следующий полезный шаг — усилить capability «${capabilityLabels[gap.family]}».`;

  return {
    candidateKey: `${familyKey}.${phase.toLowerCase()}`,
    topicKey: topic.key,
    capabilityGap: gap.family,
    learningPhase: phase,
    recommendedFamilyKey: familyKey,
    criticalPrerequisitesMet: topic.criticalPrerequisitesMet,
    loadMode: context.loadMode,
    estimatedMinutes: estimatedMinutes(context.loadMode),
    title: topic.title,
    reason,
    evidenceNeeded: evidenceNeeded(gap),
    completionTarget: completionTarget(phase),
    gapSeverity: gapSeverity(gap),
    missingFamily: gap.coverage === 'NOT_TESTED',
    prerequisiteUnlock: topic.prerequisiteUnlock,
    targetRelevance: topic.targetRelevance,
    reviewDue: topic.needsReview ? 100 : 0,
    diversity: topic.recentExposureCount === 0 ? 10 : 0,
    redundancyPenalty: Math.min(30, Math.max(0, topic.recentExposureCount - 1) * 15),
    overloadPenalty: phase === 'TRANSFER' ? 25 : 15,
    recentExposurePenalty: Math.min(30, topic.recentExposureCount * 10),
  };
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
    private readonly capability: CapabilityProjectionService,
  ) {}

  public async recommendation(): Promise<unknown> {
    const [
      topics,
      recentSessions,
      settings,
      misconceptionFindings,
      capabilitySummary,
      activeContentPacks,
    ] = await Promise.all([
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
          learningSequences: {
            orderBy: [{ key: 'asc' }, { version: 'desc' }],
          },
          tasks: {
            where: { status: 'ACTIVE' },
            select: {
              stableKey: true,
              versions: {
                select: { version: true, sourcePack: true, sourceVersion: true },
              },
            },
          },
          contentItems: {
            where: { status: 'ACTIVE' },
            select: {
              stableKey: true,
              version: true,
              sourcePack: true,
              sourceVersion: true,
            },
          },
        },
      }),
      this.database.client.learningSession.findMany({
        where: { userId: DEFAULT_USER_ID, mode: { not: 'ASSESSMENT' } },
        orderBy: [{ completedAt: 'desc' }, { startedAt: 'desc' }],
        take: 5,
        include: {
          items: {
            select: {
              taskVersion: { select: { task: { select: { topic: { select: { key: true } } } } } },
            },
          },
        },
      }),
      this.database.client.userSettings.findUnique({ where: { userId: DEFAULT_USER_ID } }),
      this.database.client.evaluationMisconception.findMany({
        where: { evaluation: { userId: DEFAULT_USER_ID, supersededBy: null } },
        select: {
          misconceptionId: true,
          evaluation: { select: { evidence: { select: { topicId: true } } } },
        },
      }),
      this.capability.userSummary(),
      this.database.client.contentPack.findMany({
        where: { status: 'ACTIVE' },
        select: { key: true, version: true },
      }),
    ]);
    const lastSession = recentSessions[0];
    const sinceLastSession = daysSince(lastSession?.completedAt ?? lastSession?.pausedAt ?? null);
    const returnDue =
      sinceLastSession !== null && sinceLastSession >= (settings?.resumeThresholdDays ?? 7);
    const overloaded = isOverloadFeedback(lastSession?.loadFeedback);
    const selectedLoadMode: LoadMode = returnDue
      ? 'RETURN'
      : overloaded
        ? 'MINIMAL'
        : (settings?.defaultLoadMode ?? 'NORMAL');
    const mistakeScores = repeatedMistakeScores(
      misconceptionFindings.map((finding) => ({
        misconceptionId: finding.misconceptionId,
        topicIds: finding.evaluation.evidence.map((evidence) => evidence.topicId),
      })),
    );
    const recentExposure = new Map<string, number>();
    const recentSequenceKeys = recentSessions
      .map((session) => recentSequenceKey(session.planSnapshot))
      .filter((key): key is string => key !== null);
    for (const session of recentSessions) {
      for (const topicKey of new Set(
        session.items.map((item) => item.taskVersion.task.topic.key),
      )) {
        recentExposure.set(topicKey, (recentExposure.get(topicKey) ?? 0) + 1);
      }
    }
    const profileByTopic = new Map(
      capabilitySummary.topics.map((profile) => [profile.topicKey, profile] as const),
    );
    const v1Candidates: RecommendationCandidate[] = [];
    const v2Candidates: RecommendationV2Candidate[] = [];
    for (const topic of topics) {
      const state = topic.topicStates[0];
      const metadata = objectValue(topic.metadata);
      const relevance = typeof metadata.yandexRelevance === 'number' ? metadata.yandexRelevance : 0;
      const prerequisitesMet = topic.prerequisites.every(({ prerequisite }) => {
        const status = prerequisite.topicStates[0]?.status ?? 'UNKNOWN';
        return status === 'SOLID' || status === 'MASTERED';
      });
      const repeatedMistakeScore = mistakeScores.get(topic.id) ?? 0;
      const prerequisiteUnlock = Math.min(100, topic._count.dependents * 20);
      const targetRelevance = relevance * 20;
      const legacyReason =
        repeatedMistakeScore > 0
          ? 'По теме повторяется подтверждённое misconception; приоритетна целевая практика.'
          : state?.status === 'UNKNOWN'
            ? 'По теме пока недостаточно evidence; короткая практика добавит калибровку.'
            : state?.needsReview === true
              ? 'Тема готова к повторению; её mastery-статус не понижен.'
              : 'Тема имеет высокий приоритет по target relevance и текущим evidence.';
      v1Candidates.push({
        topicKey: topic.key,
        sessionMode: state?.needsReview ? 'REVIEW' : 'TRAINING',
        targetWeight: targetRelevance,
        weaknessScore: weakness(state?.status ?? 'UNKNOWN', state?.masteryEstimate ?? null),
        prerequisiteUnlockValue: prerequisiteUnlock,
        reviewDueScore: state?.needsReview ? 100 : 0,
        repeatedMistakeScore,
        criticalPrerequisitesMet: prerequisitesMet,
        reason: legacyReason,
      });
      const profile = profileByTopic.get(topic.key);
      if (profile !== undefined) {
        const candidate = recommendationCandidateForTopic(
          {
            key: topic.key,
            title: topic.title,
            status: state?.status ?? 'UNKNOWN',
            needsReview: state?.needsReview ?? false,
            criticalPrerequisitesMet: prerequisitesMet,
            prerequisiteUnlock,
            targetRelevance,
            repeatedMistakeScore,
            recentExposureCount: recentExposure.get(topic.key) ?? 0,
            profile,
          },
          { loadMode: selectedLoadMode, returnDue },
        );
        if (candidate.learningPhase === 'CALIBRATION') continue;
        let sequence;
        try {
          sequence = selectStoredLearningSequence(
            filterLearningSequencesByAvailableReferences(
              filterLearningSequencesByActiveSource(
                topic.learningSequences.map(
                  (stored): StoredLearningSequenceBlueprint => ({
                    ...stored,
                    topicKey: topic.key,
                  }),
                ),
                activeContentPacks,
              ),
              {
                taskVersions: topic.tasks.flatMap((task) =>
                  task.versions.map((version) => ({ stableKey: task.stableKey, ...version })),
                ),
                contentItems: topic.contentItems,
              },
            ),
            {
              topicKey: topic.key,
              phase: candidate.learningPhase,
              loadMode: selectedLoadMode,
              recentSequenceKeys,
            },
          );
        } catch {
          throw invalidState(
            'SESSION_SEQUENCE_INVALID',
            `Imported learning sequence для темы ${topic.key} не соответствует contract`,
          );
        }
        if (sequence !== null) {
          const { requiredSteps, minimumNoHelpSuccesses } = sequence.snapshot.completionRule;
          v2Candidates.push({
            ...candidate,
            sequenceKey: sequence.snapshot.key,
            estimatedMinutes: sequence.snapshot.estimatedMinutes,
            completionTarget: `Обязательных steps: ${String(requiredSteps)}; успешных ответов без подсказки: ${String(minimumNoHelpSuccesses)}.`,
          });
        }
      }
    }
    const recommendationV2 = recommendNextV2(v2Candidates, {
      loadFeedback: !returnDue && overloaded ? 'OVERLOAD' : 'NORMAL',
    });
    const curriculumTopics = await this.curriculum.topics({});
    if (recommendationV2 !== null) {
      const topic = curriculumTopics.find(
        (item) => objectValue(item).key === recommendationV2.topicKey,
      );
      const mode = returnDue
        ? 'RETURN'
        : recommendationV2.learningPhase === 'TRANSFER'
          ? 'INTERVIEW'
          : recommendationV2.learningPhase === 'CONSOLIDATION'
            ? 'REVIEW'
            : 'TRAINING';
      return { topic: topic ?? null, mode, ...recommendationV2 };
    }

    const legacy = recommendPrimarySession(v1Candidates, {
      selectedLoadMode: settings?.defaultLoadMode ?? 'NORMAL',
      loadFeedback: lastSession?.loadFeedback ?? null,
      daysSinceLastSession: sinceLastSession,
      resumeThresholdDays: settings?.resumeThresholdDays ?? 7,
    });
    if (!legacy) {
      return {
        topic: null,
        mode: 'TRAINING',
        loadMode: settings?.defaultLoadMode ?? 'NORMAL',
        reason: 'Нет доступной темы с выполненными prerequisite.',
      };
    }
    const topic = curriculumTopics.find((item) => objectValue(item).key === legacy.topicKey);
    return {
      topic: topic ?? null,
      mode: legacy.sessionMode,
      loadMode: legacy.loadMode,
      reason: legacy.reason,
    };
  }
}
