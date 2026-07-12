import type { TopicStatus } from '@skillforge/contracts';

import {
  DEFAULT_EVALUATOR_RELIABILITY,
  EVIDENCE_TYPE_WEIGHTS,
  MASTERY_ALGORITHM_VERSION,
  MASTERY_CONFIG,
} from './config.js';
import { masteryConfidence, masteryEstimate } from './estimate.js';
import { differenceInDays, round, toDate, utcDayKey } from './math.js';
import { normalizeEvidence } from './normalize.js';
import { createReviewSchedule, isReviewDue } from './review.js';
import type {
  NormalizedEvidence,
  ReviewOutcome,
  StatusGate,
  TopicEvidenceInput,
  TopicStateExplanation,
  TopicStateOptions,
  TopicStateResult,
} from './types.js';

interface PreparedEvidence {
  source: TopicEvidenceInput;
  index: number;
  occurredAt: Date;
  normalized: NormalizedEvidence;
  submitted: boolean;
  successful: boolean;
  failed: boolean;
}

const STATUS_SUMMARIES: Readonly<Record<TopicStatus, string>> = Object.freeze({
  UNKNOWN: 'Недостаточно надёжных evidence для оценки темы.',
  WEAK: 'Evidence указывают на базовые пробелы, требующие целевой практики.',
  UNSTABLE: 'Результат пока нестабилен или недостаточно разнообразен.',
  SOLID: 'Навык устойчиво подтверждён несколькими независимыми evidence.',
  MASTERED: 'Навык подтверждён разнообразной, отложенной и переносимой практикой.',
});

function attemptIdentity(evidence: PreparedEvidence): string {
  return (
    evidence.source.attemptId ??
    evidence.source.id ??
    `${evidence.occurredAt.toISOString()}:${evidence.source.kind}:${evidence.index}`
  );
}

function isDeterministic(evidence: PreparedEvidence): boolean {
  return (
    evidence.source.evaluatorType === 'EXACT_MATCH' ||
    evidence.source.evaluatorType === 'TEST_RUNNER'
  );
}

function isBasic(evidence: PreparedEvidence): boolean {
  return evidence.source.isBasic ?? evidence.source.difficulty !== 'HARD';
}

function statusGate(
  code: string,
  met: boolean,
  actual: StatusGate['actual'],
  required: StatusGate['required'],
): StatusGate {
  return { code, met, actual, required };
}

function emptyTopicState(): TopicStateResult {
  const explanation: TopicStateExplanation = {
    algorithmVersion: MASTERY_ALGORITHM_VERSION,
    summary: STATUS_SUMMARIES.UNKNOWN,
    estimateBeforeSufficiencyGate: MASTERY_CONFIG.priorScore,
    factors: {
      totalReliableWeight: 0,
      independentDays: 0,
      taskKindCount: 0,
      evidenceKindCount: 0,
      hasDelayedEvidence: false,
      hasNoHelpSuccess: false,
      hasTransferEvidence: false,
      recentFailureCount: 0,
      recentDeterministicBasicFailureCount: 0,
      lastEvidenceFailed: false,
    },
    statusGates: [
      statusGate('minimum-reliable-weight', false, 0, MASTERY_CONFIG.minimumReliableWeight),
      statusGate('submitted-attempt', false, false, true),
    ],
  };
  return {
    status: 'UNKNOWN',
    masteryEstimate: null,
    masteryConfidence: 0,
    evidenceWeight: 0,
    evidenceCount: 0,
    independentDays: 0,
    taskKindCount: 0,
    needsReview: false,
    lastEvidenceAt: null,
    nextReviewAt: null,
    algorithmVersion: MASTERY_ALGORITHM_VERSION,
    explanation,
    reviewSchedule: null,
  };
}

function prepareEvidence(evidence: readonly TopicEvidenceInput[]): PreparedEvidence[] {
  if (evidence.length === 0) return [];
  const dated = evidence.map((source, index) => ({
    source,
    index,
    occurredAt: toDate(source.occurredAt, 'occurredAt'),
  }));
  const first = dated[0];
  if (first === undefined) return [];
  const latestAt = dated.reduce(
    (latest, item) => (item.occurredAt > latest ? item.occurredAt : latest),
    first.occurredAt,
  );

  return dated
    .map(({ source, index, occurredAt }) => {
      const normalized = normalizeEvidence({
        rawScore: source.rawScore,
        evaluatorReliability:
          source.evaluatorReliability ?? DEFAULT_EVALUATOR_RELIABILITY[source.evaluatorType],
        evidenceTypeWeight: source.evidenceTypeWeight ?? EVIDENCE_TYPE_WEIGHTS[source.kind],
        helpLevel: source.helpLevel,
        ageDays: differenceInDays(latestAt, occurredAt),
        halfLifeDays: source.halfLifeDays ?? 90,
      });
      const successful =
        source.passed === true ||
        (source.passed !== false && normalized.normalizedScore >= MASTERY_CONFIG.successScore);
      const failed =
        source.passed === false || normalized.normalizedScore < MASTERY_CONFIG.failureScore;
      return {
        source,
        index,
        occurredAt,
        normalized,
        submitted: source.submitted ?? true,
        successful,
        failed,
      };
    })
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() || left.index - right.index,
    );
}

function inferOutcome(evidence: PreparedEvidence): ReviewOutcome {
  if (evidence.failed) return 'failure';
  if (evidence.successful) return 'success';
  return 'partial';
}

export function computeTopicState(
  evidence: readonly TopicEvidenceInput[],
  options: TopicStateOptions = {},
): TopicStateResult {
  const prepared = prepareEvidence(evidence);
  if (prepared.length === 0) return emptyTopicState();

  const latest = prepared.at(-1);
  if (latest === undefined) return emptyTopicState();
  const now = options.now === undefined ? latest.occurredAt : toDate(options.now, 'now');
  const submitted = prepared.filter((item) => item.submitted);
  const totalWeight = prepared.reduce((sum, item) => sum + item.normalized.weight, 0);
  const independentDays = new Set(submitted.map((item) => utcDayKey(item.occurredAt))).size;
  const taskKindCount = new Set(
    submitted.flatMap((item) => (item.source.taskKind === undefined ? [] : [item.source.taskKind])),
  ).size;
  const evidenceKindCount = new Set(submitted.map((item) => item.source.kind)).size;
  const hasNoHelpSuccess = submitted.some(
    (item) => item.successful && item.source.helpLevel === 'NONE',
  );
  const hasTransferEvidence = submitted.some(
    (item) =>
      item.successful &&
      (item.source.kind === 'TRANSFER' ||
        item.source.kind === 'BATTLE' ||
        item.source.kind === 'INTERVIEW_RESPONSE'),
  );
  const hasDelayedEvidence = submitted.some(
    (later, laterIndex) =>
      later.successful &&
      submitted
        .slice(0, laterIndex)
        .some(
          (earlier) =>
            differenceInDays(later.occurredAt, earlier.occurredAt) >=
            MASTERY_CONFIG.delayedEvidenceDays,
        ),
  );
  const recent = submitted.filter(
    (item) =>
      differenceInDays(latest.occurredAt, item.occurredAt) <= MASTERY_CONFIG.freshFailureDays,
  );
  const recentFailureIdentities = new Set(
    recent.filter((item) => item.failed).map(attemptIdentity),
  );
  const deterministicBasicFailureIdentities = new Set(
    recent
      .filter((item) => item.failed && isDeterministic(item) && isBasic(item))
      .map(attemptIdentity),
  );
  const successes = submitted.filter((item) => item.successful);
  const allSuccessesUsedSignificantHelp =
    successes.length > 0 &&
    successes.every(
      (item) =>
        item.source.helpLevel === 'HINT' ||
        item.source.helpLevel === 'MULTIPLE_HINTS' ||
        item.source.helpLevel === 'SOLUTION_VIEWED',
    );

  const estimate = masteryEstimate(prepared.map((item) => item.normalized));
  const confidence = masteryConfidence({
    totalWeight,
    independentDays,
    taskKindCount,
    hasDelayedEvidence,
    hasNoHelpSuccess,
  });
  const hasEnoughWeight = totalWeight >= MASTERY_CONFIG.minimumReliableWeight;
  const hasSubmittedAttempt = submitted.length > 0;
  const twoDeterministicBasicFailures = deterministicBasicFailureIdentities.size >= 2;
  const highButSingleEvidenceKind =
    estimate >= MASTERY_CONFIG.solidEstimateThreshold && evidenceKindCount < 2;

  const masteredGates = [
    estimate >= MASTERY_CONFIG.masteredEstimateThreshold,
    confidence >= MASTERY_CONFIG.masteredConfidenceThreshold,
    independentDays >= 3,
    evidenceKindCount >= 3,
    hasDelayedEvidence,
    hasTransferEvidence,
    !latest.failed,
  ];
  const solidGates = [
    estimate >= MASTERY_CONFIG.solidEstimateThreshold,
    confidence >= MASTERY_CONFIG.solidConfidenceThreshold,
    independentDays >= 2,
    taskKindCount >= 2,
    hasNoHelpSuccess,
    recentFailureIdentities.size < 2,
  ];

  let status: TopicStatus;
  if (!hasEnoughWeight || !hasSubmittedAttempt) status = 'UNKNOWN';
  else if (estimate < MASTERY_CONFIG.weakEstimateUpperBound || twoDeterministicBasicFailures)
    status = 'WEAK';
  else if (allSuccessesUsedSignificantHelp || highButSingleEvidenceKind) status = 'UNSTABLE';
  else if (masteredGates.every(Boolean)) status = 'MASTERED';
  else if (solidGates.every(Boolean)) status = 'SOLID';
  else status = 'UNSTABLE';

  const reviewSchedule = createReviewSchedule({
    status,
    lastEvidenceAt: latest.occurredAt,
    outcome: inferOutcome(latest),
    helpLevel: latest.source.helpLevel,
    ...(options.overloaded === undefined ? {} : { overloaded: options.overloaded }),
  });

  const roundedEstimate = round(estimate);
  const roundedConfidence = round(confidence);
  const roundedWeight = round(totalWeight, 4);
  const explanation: TopicStateExplanation = {
    algorithmVersion: MASTERY_ALGORITHM_VERSION,
    summary: STATUS_SUMMARIES[status],
    estimateBeforeSufficiencyGate: roundedEstimate,
    factors: {
      totalReliableWeight: roundedWeight,
      independentDays,
      taskKindCount,
      evidenceKindCount,
      hasDelayedEvidence,
      hasNoHelpSuccess,
      hasTransferEvidence,
      recentFailureCount: recentFailureIdentities.size,
      recentDeterministicBasicFailureCount: deterministicBasicFailureIdentities.size,
      lastEvidenceFailed: latest.failed,
    },
    statusGates: [
      statusGate(
        'minimum-reliable-weight',
        hasEnoughWeight,
        roundedWeight,
        MASTERY_CONFIG.minimumReliableWeight,
      ),
      statusGate('submitted-attempt', hasSubmittedAttempt, hasSubmittedAttempt, true),
      statusGate(
        'solid-estimate',
        estimate >= MASTERY_CONFIG.solidEstimateThreshold,
        roundedEstimate,
        MASTERY_CONFIG.solidEstimateThreshold,
      ),
      statusGate(
        'solid-confidence',
        confidence >= MASTERY_CONFIG.solidConfidenceThreshold,
        roundedConfidence,
        MASTERY_CONFIG.solidConfidenceThreshold,
      ),
      statusGate(
        'mastered-estimate',
        estimate >= MASTERY_CONFIG.masteredEstimateThreshold,
        roundedEstimate,
        MASTERY_CONFIG.masteredEstimateThreshold,
      ),
      statusGate(
        'mastered-confidence',
        confidence >= MASTERY_CONFIG.masteredConfidenceThreshold,
        roundedConfidence,
        MASTERY_CONFIG.masteredConfidenceThreshold,
      ),
      statusGate('delayed-evidence', hasDelayedEvidence, hasDelayedEvidence, true),
      statusGate('transfer-evidence', hasTransferEvidence, hasTransferEvidence, true),
      statusGate('last-evidence-not-failed', !latest.failed, !latest.failed, true),
    ],
  };

  return {
    status,
    masteryEstimate: status === 'UNKNOWN' ? null : roundedEstimate,
    masteryConfidence: roundedConfidence,
    evidenceWeight: roundedWeight,
    evidenceCount: submitted.length,
    independentDays,
    taskKindCount,
    needsReview: isReviewDue(reviewSchedule, now),
    lastEvidenceAt: latest.occurredAt.toISOString(),
    nextReviewAt: reviewSchedule?.dueAt ?? null,
    algorithmVersion: MASTERY_ALGORITHM_VERSION,
    explanation,
    reviewSchedule,
  };
}

export const deriveTopicState = computeTopicState;
