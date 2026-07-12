import type { LoadMode, SessionMode } from '@skillforge/contracts';

import { RECOMMENDATION_ALGORITHM_VERSION } from './config.js';
import { round } from './math.js';
import type {
  RecommendationCandidate,
  RecommendationContext,
  RecommendationResult,
} from './types.js';

const PRIORITY_FACTORS = Object.freeze({
  targetWeight: 0.3,
  weaknessScore: 0.25,
  prerequisiteUnlockValue: 0.2,
  reviewDueScore: 0.15,
  repeatedMistakeScore: 0.1,
});

function assertPriorityFactor(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite non-negative number`);
}

export function calculateRecommendationPriority(
  candidate: Pick<
    RecommendationCandidate,
    | 'targetWeight'
    | 'weaknessScore'
    | 'prerequisiteUnlockValue'
    | 'reviewDueScore'
    | 'repeatedMistakeScore'
  >,
): number {
  assertPriorityFactor(candidate.targetWeight, 'targetWeight');
  assertPriorityFactor(candidate.weaknessScore, 'weaknessScore');
  assertPriorityFactor(candidate.prerequisiteUnlockValue, 'prerequisiteUnlockValue');
  assertPriorityFactor(candidate.reviewDueScore, 'reviewDueScore');
  assertPriorityFactor(candidate.repeatedMistakeScore, 'repeatedMistakeScore');
  return (
    candidate.targetWeight * PRIORITY_FACTORS.targetWeight +
    candidate.weaknessScore * PRIORITY_FACTORS.weaknessScore +
    candidate.prerequisiteUnlockValue * PRIORITY_FACTORS.prerequisiteUnlockValue +
    candidate.reviewDueScore * PRIORITY_FACTORS.reviewDueScore +
    candidate.repeatedMistakeScore * PRIORITY_FACTORS.repeatedMistakeScore
  );
}

function isOverloaded(feedback: string | null | undefined): boolean {
  if (!feedback) return false;
  const normalized = feedback.trim().toLowerCase();
  return (
    normalized === 'hard' ||
    normalized === 'heavy' ||
    normalized === 'overload' ||
    normalized === 'overloaded'
  );
}

function selectSessionMode(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
): SessionMode {
  const resumeThresholdDays = context.resumeThresholdDays ?? 7;
  if (
    context.daysSinceLastSession !== null &&
    context.daysSinceLastSession !== undefined &&
    context.daysSinceLastSession >= resumeThresholdDays
  ) {
    return 'RETURN';
  }
  return context.userSelectedMode ?? candidate.sessionMode;
}

function selectLoadMode(context: RecommendationContext, sessionMode: SessionMode): LoadMode {
  if (sessionMode === 'RETURN') return 'RETURN';
  if (isOverloaded(context.loadFeedback)) return 'MINIMAL';
  return context.selectedLoadMode ?? 'NORMAL';
}

export function recommendPrimarySession(
  candidates: readonly RecommendationCandidate[],
  context: RecommendationContext = {},
): RecommendationResult | null {
  let eligible = candidates.filter((candidate) => candidate.criticalPrerequisitesMet);
  if (context.userSelectedMode !== undefined) {
    const matchingMode = eligible.filter(
      (candidate) => candidate.sessionMode === context.userSelectedMode,
    );
    if (matchingMode.length > 0) eligible = matchingMode;
  }

  const ranked = eligible
    .map((candidate) => ({ candidate, priority: calculateRecommendationPriority(candidate) }))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.candidate.topicKey.localeCompare(right.candidate.topicKey),
    );
  const primary = ranked[0];
  if (!primary) return null;

  const sessionMode = selectSessionMode(primary.candidate, context);
  const { candidate } = primary;
  return {
    algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
    topicKey: candidate.topicKey,
    sessionMode,
    loadMode: selectLoadMode(context, sessionMode),
    priority: round(primary.priority),
    reason: candidate.reason,
    priorityFactors: {
      targetWeight: candidate.targetWeight,
      weaknessScore: candidate.weaknessScore,
      prerequisiteUnlockValue: candidate.prerequisiteUnlockValue,
      reviewDueScore: candidate.reviewDueScore,
      repeatedMistakeScore: candidate.repeatedMistakeScore,
    },
  };
}

export const recommendNextSession = recommendPrimarySession;
