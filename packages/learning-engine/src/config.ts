import type { EvidenceKind, EvaluatorType, HelpLevel, TopicStatus } from '@skillforge/contracts';

export const MASTERY_ALGORITHM_VERSION = 'mastery-v1.0' as const;
export const REVIEW_ALGORITHM_VERSION = 'review-v1.0' as const;
export const READINESS_ALGORITHM_VERSION = 'readiness-v1.0' as const;
export const RECOMMENDATION_ALGORITHM_VERSION = 'recommendation-v1.0' as const;
export const RECOMMENDATION_V2_ALGORITHM_VERSION = 'recommendation-v2.0' as const;
export const CAPABILITY_PROFILE_ALGORITHM_VERSION = 'capability-profile-v1.0' as const;

export const LEARNING_PHASES = ['CALIBRATION', 'ACQUISITION', 'CONSOLIDATION', 'TRANSFER'] as const;

export const SEQUENCE_LEARNING_PHASES = ['ACQUISITION', 'CONSOLIDATION', 'TRANSFER'] as const;

export const RECOMMENDATION_V2_CONFIG = Object.freeze({
  missingFamilyBonus: 20,
  consistentIndependentSignalsToStop: 2,
  repeatedMisconceptionErrorsToStop: 2,
  adjacentNoAnswerLevelsToStop: 2,
});

export const CAPABILITY_FAMILIES = [
  'TERM',
  'MECHANISM',
  'TRACE',
  'DEBUG',
  'CODE_PRODUCTION',
  'TRANSFER',
  'CALIBRATION',
] as const;

export const CAPABILITY_PROFILE_CONFIG = Object.freeze({
  priorScore: 50,
  priorWeight: 1.5,
  minimumReliableWeight: 1.5,
  minimumScoredEvidenceCount: 2,
  defaultHalfLifeDays: 90,
  successScore: 70,
  delayedEvidenceDays: 7,
  confidenceWeightFactor: 20,
  confidenceIndependentDayFactor: 8,
  confidenceTaskKindFactor: 6,
  confidenceDelayedBonus: 10,
  confidenceNoHelpBonus: 5,
});

export const AUTONOMY_FACTORS: Readonly<Record<HelpLevel, number>> = Object.freeze({
  NONE: 1,
  NUDGE: 0.9,
  HINT: 0.8,
  MULTIPLE_HINTS: 0.65,
  SOLUTION_VIEWED: 0.4,
});

export const DEFAULT_EVALUATOR_RELIABILITY: Readonly<Record<EvaluatorType, number>> = Object.freeze(
  {
    TEST_RUNNER: 1,
    EXACT_MATCH: 0.95,
    MANUAL: 0.9,
    EXTERNAL_AI: 0.65,
    API_AI: 0.55,
    SELF_REPORT: 0.1,
  },
);

export const EVIDENCE_TYPE_WEIGHTS: Readonly<Record<EvidenceKind, number>> = Object.freeze({
  CODE_CORRECTNESS: 1.3,
  DEBUGGING: 1.1,
  PREDICT_OUTPUT: 1,
  EXPLANATION: 0.9,
  RECALL: 0.75,
  EDGE_CASES: 1,
  COMPLEXITY_REASONING: 1,
  INTERVIEW_RESPONSE: 1.1,
  TRANSFER: 1.25,
  BATTLE: 1.3,
  AI_REVIEW: 1.1,
  SELF_REPORT: 0.1,
});

export const MASTERY_CONFIG = Object.freeze({
  priorScore: 50,
  priorWeight: 1.5,
  minimumReliableWeight: 1.5,
  weakEstimateUpperBound: 40,
  solidEstimateThreshold: 70,
  solidConfidenceThreshold: 55,
  masteredEstimateThreshold: 85,
  masteredConfidenceThreshold: 75,
  delayedEvidenceDays: 7,
  freshFailureDays: 30,
  successScore: 70,
  failureScore: 40,
  confidenceWeightFactor: 20,
  confidenceIndependentDayFactor: 8,
  confidenceTaskKindFactor: 6,
  confidenceDelayedBonus: 10,
  confidenceNoHelpBonus: 5,
});

export const REVIEW_BASE_INTERVAL_DAYS: Readonly<Partial<Record<TopicStatus, number>>> =
  Object.freeze({
    WEAK: 2,
    UNSTABLE: 4,
    SOLID: 20,
    MASTERED: 60,
  });
