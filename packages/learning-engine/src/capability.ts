import type { EvidenceKind } from '@skillforge/contracts';

import {
  CAPABILITY_FAMILIES,
  CAPABILITY_PROFILE_ALGORITHM_VERSION,
  CAPABILITY_PROFILE_CONFIG,
  DEFAULT_EVALUATOR_RELIABILITY,
  EVIDENCE_TYPE_WEIGHTS,
} from './config.js';
import { assertFiniteInRange, clamp, differenceInDays, round, toDate, utcDayKey } from './math.js';
import { normalizeEvidence } from './normalize.js';
import type {
  CapabilityEvidenceInput,
  CapabilityFamily,
  CapabilityFamilyMappingInput,
  CapabilityState,
  DateInput,
  NormalizedCapabilityEvidence,
  TopicCapabilityProfile,
} from './types.js';

const CONSERVATIVE_V1_FAMILY_BY_EVIDENCE_KIND: Readonly<
  Partial<Record<EvidenceKind, CapabilityFamily>>
> = Object.freeze({
  PREDICT_OUTPUT: 'TRACE',
  DEBUGGING: 'DEBUG',
  CODE_CORRECTNESS: 'CODE_PRODUCTION',
  TRANSFER: 'TRANSFER',
  BATTLE: 'TRANSFER',
  INTERVIEW_RESPONSE: 'TRANSFER',
});

function canonicalFamilies(families: readonly CapabilityFamily[]): CapabilityFamily[] {
  const requested = new Set(families);
  return CAPABILITY_FAMILIES.filter((family) => requested.has(family));
}

export function mapCapabilityFamilies(input: CapabilityFamilyMappingInput): CapabilityFamily[] {
  if (input.families !== undefined) return canonicalFamilies(input.families);

  if (input.taskMetadata?.sourceSchemaVersion === '2.0') {
    return canonicalFamilies(input.taskMetadata.evidenceFamilies);
  }

  const fallback = CONSERVATIVE_V1_FAMILY_BY_EVIDENCE_KIND[input.evidenceKind];
  return fallback === undefined ? [] : [fallback];
}

function lacksDimensionLinkage(
  input: CapabilityEvidenceInput,
  families: readonly CapabilityFamily[],
): boolean {
  return (
    input.families === undefined &&
    input.taskMetadata?.sourceSchemaVersion === '2.0' &&
    (input.taskMetadata.mixedEvidence || families.length > 1)
  );
}

export function normalizeCapabilityEvidence(
  input: CapabilityEvidenceInput,
  referenceAt: DateInput = input.occurredAt,
): NormalizedCapabilityEvidence {
  const occurredAt = toDate(input.occurredAt, 'occurredAt');
  const reference = toDate(referenceAt, 'referenceAt');
  const families = mapCapabilityFamilies(input);
  const forcedPending = lacksDimensionLinkage(input, families);
  const pending = input.pending === true || forcedPending;

  if (input.pending === true && input.rawScore !== undefined && input.rawScore !== null) {
    throw new RangeError('pending capability evidence cannot contain a rawScore');
  }

  const normalized = normalizeEvidence({
    rawScore: input.pending === true ? 0 : input.rawScore,
    evaluatorReliability:
      input.evaluatorReliability ?? DEFAULT_EVALUATOR_RELIABILITY[input.evaluatorType],
    evidenceTypeWeight: input.evidenceTypeWeight ?? EVIDENCE_TYPE_WEIGHTS[input.evidenceKind],
    helpLevel: input.helpLevel,
    ageDays: differenceInDays(reference, occurredAt),
    halfLifeDays: input.halfLifeDays ?? CAPABILITY_PROFILE_CONFIG.defaultHalfLifeDays,
  });

  return {
    families,
    pending,
    normalizedScore: pending ? null : normalized.normalizedScore,
    weight: pending ? 0 : normalized.weight,
    helpLevel: input.helpLevel,
    occurredAt: occurredAt.toISOString(),
    evidenceKind: input.evidenceKind,
    passed: input.passed ?? null,
    ...(input.taskKind === undefined ? {} : { taskKind: input.taskKind }),
  };
}

function validateNormalizedEvidence(item: NormalizedCapabilityEvidence): Date {
  const occurredAt = toDate(item.occurredAt, 'occurredAt');
  assertFiniteInRange(item.weight, 'weight', 0, 2);
  if (item.pending) {
    if (item.normalizedScore !== null || item.weight !== 0) {
      throw new RangeError('pending capability evidence must have a null score and zero weight');
    }
  } else {
    if (item.normalizedScore === null) {
      throw new RangeError('scored capability evidence must have a normalizedScore');
    }
    assertFiniteInRange(item.normalizedScore, 'normalizedScore', 0, 100);
  }
  return occurredAt;
}

function successful(item: NormalizedCapabilityEvidence): boolean {
  if (item.pending || item.normalizedScore === null) return false;
  return (
    item.passed === true ||
    (item.passed !== false && item.normalizedScore >= CAPABILITY_PROFILE_CONFIG.successScore)
  );
}

function capabilityEstimate(
  evidence: readonly { normalizedScore: number; weight: number }[],
): number {
  const numerator = evidence.reduce<number>(
    (sum, item) => sum + item.weight * item.normalizedScore,
    CAPABILITY_PROFILE_CONFIG.priorWeight * CAPABILITY_PROFILE_CONFIG.priorScore,
  );
  const denominator = evidence.reduce<number>(
    (sum, item) => sum + item.weight,
    CAPABILITY_PROFILE_CONFIG.priorWeight,
  );
  return numerator / denominator;
}

function capabilityConfidence(input: {
  totalWeight: number;
  independentDays: number;
  taskKindCount: number;
  hasDelayedEvidence: boolean;
  hasNoHelpSuccess: boolean;
}): number {
  const value =
    CAPABILITY_PROFILE_CONFIG.confidenceWeightFactor * Math.log1p(input.totalWeight) +
    CAPABILITY_PROFILE_CONFIG.confidenceIndependentDayFactor * Math.min(input.independentDays, 4) +
    CAPABILITY_PROFILE_CONFIG.confidenceTaskKindFactor * Math.min(input.taskKindCount, 4) +
    (input.hasDelayedEvidence ? CAPABILITY_PROFILE_CONFIG.confidenceDelayedBonus : 0) +
    (input.hasNoHelpSuccess ? CAPABILITY_PROFILE_CONFIG.confidenceNoHelpBonus : 0);
  return clamp(value, 0, 100);
}

function notTestedCapability(family: CapabilityFamily): CapabilityState {
  return {
    family,
    coverage: 'NOT_TESTED',
    estimate: null,
    confidence: 0,
    evidenceCount: 0,
    independentDays: 0,
    noHelpSuccessCount: 0,
    pendingReviewCount: 0,
    lastEvidenceAt: null,
    explanation: [`Нет явно сопоставленных evidence для capability ${family}.`],
  };
}

export function calculateCapabilityState(
  family: CapabilityFamily,
  evidence: readonly NormalizedCapabilityEvidence[],
): CapabilityState {
  const relevant = evidence
    .filter((item) => item.families.includes(family))
    .map((item) => ({ item, occurredAt: validateNormalizedEvidence(item) }))
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());

  if (relevant.length === 0) return notTestedCapability(family);

  const pendingReviewCount = relevant.filter(({ item }) => item.pending).length;
  const scored = relevant.filter(
    (
      entry,
    ): entry is typeof entry & {
      item: NormalizedCapabilityEvidence & { normalizedScore: number };
    } => !entry.item.pending && entry.item.normalizedScore !== null,
  );
  const evidenceCount = scored.length;
  const independentDays = new Set(scored.map(({ occurredAt }) => utcDayKey(occurredAt))).size;
  const noHelpSuccessCount = scored.filter(
    ({ item }) => item.helpLevel === 'NONE' && successful(item),
  ).length;
  const lastEvidenceAt = relevant.at(-1)?.occurredAt.toISOString() ?? null;

  if (scored.length === 0) {
    return {
      family,
      coverage: 'INSUFFICIENT',
      estimate: null,
      confidence: 0,
      evidenceCount: 0,
      independentDays: 0,
      noHelpSuccessCount: 0,
      pendingReviewCount,
      lastEvidenceAt,
      explanation: ['Есть только evidence, ожидающие проверки; capability ещё не откалибрована.'],
    };
  }

  const normalized = scored.map(({ item }) => ({
    normalizedScore: item.normalizedScore,
    weight: item.weight,
  }));
  const totalWeight = normalized.reduce((sum, item) => sum + item.weight, 0);
  const evidenceKindCount = new Set(scored.map(({ item }) => item.evidenceKind)).size;
  const taskKindCount = new Set(
    scored.flatMap(({ item }) => (item.taskKind === undefined ? [] : [item.taskKind])),
  ).size;
  const hasDelayedEvidence = scored.some(
    (later, laterIndex) =>
      successful(later.item) &&
      scored
        .slice(0, laterIndex)
        .some(
          (earlier) =>
            differenceInDays(later.occurredAt, earlier.occurredAt) >=
            CAPABILITY_PROFILE_CONFIG.delayedEvidenceDays,
        ),
  );
  const confidence = capabilityConfidence({
    totalWeight,
    independentDays,
    taskKindCount: Math.max(taskKindCount, evidenceKindCount),
    hasDelayedEvidence,
    hasNoHelpSuccess: noHelpSuccessCount > 0,
  });
  const sufficient =
    scored.length >= CAPABILITY_PROFILE_CONFIG.minimumScoredEvidenceCount &&
    totalWeight >= CAPABILITY_PROFILE_CONFIG.minimumReliableWeight;
  const explanation = [
    sufficient
      ? 'Данных достаточно для ограниченной capability projection.'
      : `Недостаточно scored evidence: требуется минимум ${String(CAPABILITY_PROFILE_CONFIG.minimumScoredEvidenceCount)} и надёжный вес ${String(CAPABILITY_PROFILE_CONFIG.minimumReliableWeight)}.`,
  ];
  if (pendingReviewCount > 0) {
    explanation.push(`Ожидают проверки: ${String(pendingReviewCount)}.`);
  }

  return {
    family,
    coverage: sufficient ? 'SUFFICIENT' : 'INSUFFICIENT',
    estimate: sufficient ? round(capabilityEstimate(normalized)) : null,
    confidence: round(confidence),
    evidenceCount,
    independentDays,
    noHelpSuccessCount,
    pendingReviewCount,
    lastEvidenceAt,
    explanation,
  };
}

function capabilityRecord(
  evidence: readonly NormalizedCapabilityEvidence[],
): Record<CapabilityFamily, CapabilityState> {
  return {
    TERM: calculateCapabilityState('TERM', evidence),
    MECHANISM: calculateCapabilityState('MECHANISM', evidence),
    TRACE: calculateCapabilityState('TRACE', evidence),
    DEBUG: calculateCapabilityState('DEBUG', evidence),
    CODE_PRODUCTION: calculateCapabilityState('CODE_PRODUCTION', evidence),
    TRANSFER: calculateCapabilityState('TRANSFER', evidence),
    CALIBRATION: calculateCapabilityState('CALIBRATION', evidence),
  };
}

export function computeTopicCapabilityProfile(
  topicKey: string,
  evidence: readonly CapabilityEvidenceInput[],
): TopicCapabilityProfile {
  if (topicKey.trim().length === 0) throw new RangeError('topicKey must not be empty');

  const prepared = evidence.map((input) => ({
    input,
    families: mapCapabilityFamilies(input),
    occurredAt: toDate(input.occurredAt, 'occurredAt'),
  }));
  const mapped = prepared.filter((item) => item.families.length > 0);
  const latestMappedAt = mapped.reduce<Date | null>(
    (latest, item) => (latest === null || item.occurredAt > latest ? item.occurredAt : latest),
    null,
  );
  const normalized = prepared.map(({ input }) =>
    normalizeCapabilityEvidence(input, latestMappedAt ?? input.occurredAt),
  );

  return {
    topicKey,
    algorithmVersion: CAPABILITY_PROFILE_ALGORITHM_VERSION,
    capabilities: capabilityRecord(normalized),
  };
}

export const calculateTopicCapabilityProfile = computeTopicCapabilityProfile;
