import type { LoadMode } from '@skillforge/contracts';

import {
  CAPABILITY_FAMILIES,
  LEARNING_PHASES,
  RECOMMENDATION_V2_ALGORITHM_VERSION,
  RECOMMENDATION_V2_CONFIG,
} from './config.js';
import { round } from './math.js';
import type { CapabilityFamily, LearningPhase } from './types.js';

export type AdaptiveLoadFeedback = 'NORMAL' | 'OVERLOAD';

export interface RecommendationV2ScoreFactors {
  gapSeverity: number;
  missingFamily: boolean;
  prerequisiteUnlock: number;
  targetRelevance: number;
  reviewDue: number;
  diversity: number;
  redundancyPenalty: number;
  overloadPenalty: number;
  recentExposurePenalty: number;
}

export interface RecommendationV2ScoreBreakdown {
  gapSeverity: number;
  missingFamily: number;
  prerequisiteUnlock: number;
  targetRelevance: number;
  reviewDue: number;
  diversity: number;
  redundancyPenalty: number;
  overloadPenalty: number;
  recentExposurePenalty: number;
}

export interface RecommendationV2Score {
  total: number;
  breakdown: RecommendationV2ScoreBreakdown;
}

export interface RecommendationV2Candidate extends RecommendationV2ScoreFactors {
  candidateKey: string;
  topicKey: string;
  capabilityGap: CapabilityFamily;
  learningPhase: LearningPhase;
  recommendedFamilyKey: string;
  criticalPrerequisitesMet: boolean;
  loadMode: LoadMode;
  sequenceKey?: string;
  estimatedMinutes: number;
  title: string;
  reason: string;
  evidenceNeeded: readonly string[];
  completionTarget: string;
}

export interface RecommendationV2Context {
  loadFeedback: AdaptiveLoadFeedback;
}

export interface RankedRecommendationV2Candidate {
  candidate: RecommendationV2Candidate;
  score: RecommendationV2Score;
}

export interface NextRecommendationV2 {
  algorithmVersion: typeof RECOMMENDATION_V2_ALGORITHM_VERSION;
  topicKey: string;
  capabilityGap: CapabilityFamily;
  learningPhase: LearningPhase;
  recommendedFamilyKey: string;
  loadMode: LoadMode;
  sequenceKey?: string;
  estimatedMinutes: number;
  title: string;
  reason: string;
  evidenceNeeded: string[];
  completionTarget: string;
  scoreBreakdown: RecommendationV2ScoreBreakdown;
}

const MACHINE_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOAD_MODES: readonly LoadMode[] = ['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'];
const LOAD_FEEDBACK_VALUES: readonly AdaptiveLoadFeedback[] = ['NORMAL', 'OVERLOAD'];

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number`);
  }
}

function assertMachineKey(value: string, label: string): void {
  if (!MACHINE_KEY_PATTERN.test(value)) {
    throw new RangeError(`${label} must be a stable English machine key`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new RangeError(`${label} must not be empty`);
}

function validateScoreFactors(factors: RecommendationV2ScoreFactors): void {
  assertNonNegative(factors.gapSeverity, 'gapSeverity');
  assertNonNegative(factors.prerequisiteUnlock, 'prerequisiteUnlock');
  assertNonNegative(factors.targetRelevance, 'targetRelevance');
  assertNonNegative(factors.reviewDue, 'reviewDue');
  assertNonNegative(factors.diversity, 'diversity');
  assertNonNegative(factors.redundancyPenalty, 'redundancyPenalty');
  assertNonNegative(factors.overloadPenalty, 'overloadPenalty');
  assertNonNegative(factors.recentExposurePenalty, 'recentExposurePenalty');
}

function penalty(value: number): number {
  const rounded = round(value);
  return rounded === 0 ? 0 : -rounded;
}

function validateRecommendationCandidate(candidate: RecommendationV2Candidate): void {
  validateScoreFactors(candidate);
  assertMachineKey(candidate.candidateKey, 'candidateKey');
  assertMachineKey(candidate.topicKey, 'topicKey');
  assertMachineKey(candidate.recommendedFamilyKey, 'recommendedFamilyKey');
  if (candidate.sequenceKey !== undefined) assertMachineKey(candidate.sequenceKey, 'sequenceKey');
  if (!CAPABILITY_FAMILIES.includes(candidate.capabilityGap)) {
    throw new RangeError('capabilityGap must be a known capability family');
  }
  if (!LEARNING_PHASES.includes(candidate.learningPhase)) {
    throw new RangeError('learningPhase must be a known learning phase');
  }
  if (!LOAD_MODES.includes(candidate.loadMode)) throw new RangeError('loadMode is not supported');
  if (!Number.isSafeInteger(candidate.estimatedMinutes) || candidate.estimatedMinutes <= 0) {
    throw new RangeError('estimatedMinutes must be a positive integer');
  }
  assertNonEmpty(candidate.title, 'title');
  assertNonEmpty(candidate.reason, 'reason');
  assertNonEmpty(candidate.completionTarget, 'completionTarget');
  candidate.evidenceNeeded.forEach((item, index) =>
    assertNonEmpty(item, `evidenceNeeded[${String(index)}]`),
  );
}

export function calculateRecommendationV2Score(
  factors: RecommendationV2ScoreFactors,
  context: RecommendationV2Context,
): RecommendationV2Score {
  validateScoreFactors(factors);
  if (!LOAD_FEEDBACK_VALUES.includes(context.loadFeedback)) {
    throw new RangeError('loadFeedback is not supported');
  }
  const breakdown: RecommendationV2ScoreBreakdown = {
    gapSeverity: round(factors.gapSeverity),
    missingFamily: factors.missingFamily ? RECOMMENDATION_V2_CONFIG.missingFamilyBonus : 0,
    prerequisiteUnlock: round(factors.prerequisiteUnlock),
    targetRelevance: round(factors.targetRelevance),
    reviewDue: round(factors.reviewDue),
    diversity: round(factors.diversity),
    redundancyPenalty: penalty(factors.redundancyPenalty),
    overloadPenalty: context.loadFeedback === 'OVERLOAD' ? penalty(factors.overloadPenalty) : 0,
    recentExposurePenalty: penalty(factors.recentExposurePenalty),
  };
  return {
    total: round(
      breakdown.gapSeverity +
        breakdown.missingFamily +
        breakdown.prerequisiteUnlock +
        breakdown.targetRelevance +
        breakdown.reviewDue +
        breakdown.diversity +
        breakdown.redundancyPenalty +
        breakdown.overloadPenalty +
        breakdown.recentExposurePenalty,
    ),
    breakdown,
  };
}

export function rankRecommendationV2Candidates(
  candidates: readonly RecommendationV2Candidate[],
  context: RecommendationV2Context,
): RankedRecommendationV2Candidate[] {
  candidates.forEach(validateRecommendationCandidate);
  return candidates
    .filter((candidate) => candidate.criticalPrerequisitesMet)
    .map((candidate) => ({ candidate, score: calculateRecommendationV2Score(candidate, context) }))
    .sort(
      (left, right) =>
        right.score.total - left.score.total ||
        left.candidate.candidateKey.localeCompare(right.candidate.candidateKey),
    );
}

export function recommendNextV2(
  candidates: readonly RecommendationV2Candidate[],
  context: RecommendationV2Context,
): NextRecommendationV2 | null {
  const ranked = rankRecommendationV2Candidates(candidates, context);
  const primary = ranked[0];
  if (primary === undefined) return null;

  const { candidate, score } = primary;
  return {
    algorithmVersion: RECOMMENDATION_V2_ALGORITHM_VERSION,
    topicKey: candidate.topicKey,
    capabilityGap: candidate.capabilityGap,
    learningPhase: candidate.learningPhase,
    recommendedFamilyKey: candidate.recommendedFamilyKey,
    loadMode: context.loadFeedback === 'OVERLOAD' ? 'MINIMAL' : candidate.loadMode,
    ...(candidate.sequenceKey === undefined ? {} : { sequenceKey: candidate.sequenceKey }),
    estimatedMinutes: candidate.estimatedMinutes,
    title: candidate.title,
    reason: candidate.reason,
    evidenceNeeded: [...candidate.evidenceNeeded],
    completionTarget: candidate.completionTarget,
    scoreBreakdown: score.breakdown,
  };
}
