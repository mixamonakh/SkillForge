import {
  EVALUATOR_TYPES,
  EVIDENCE_KINDS,
  type EvaluatorType,
  type EvidenceKind,
  type HelpLevel,
  type TaskKind,
} from '@skillforge/contracts';
import {
  CAPABILITY_FAMILIES,
  DEFAULT_EVALUATOR_RELIABILITY,
  mapCapabilityFamilies,
  type CapabilityEvidenceInput,
  type CapabilityFamily,
  type CapabilityTaskMetadataInput,
} from '@skillforge/learning-engine';

import { objectValue, stringArray } from '../../common/json.js';

const evidenceKindSet = new Set<string>(EVIDENCE_KINDS);
const evaluatorTypeSet = new Set<string>(EVALUATOR_TYPES);
const capabilityFamilySet = new Set<string>(CAPABILITY_FAMILIES);
const reviewableTaskKinds = new Set<TaskKind>([
  'EXPLAIN',
  'PREDICT_OUTPUT',
  'FIND_BUG',
  'COMPARE_SOLUTIONS',
  'AI_REVIEW',
]);

export type CapabilityEvidenceSource = {
  topicId: string;
  kind: EvidenceKind;
  rawScore: number;
  occurredAt: Date;
  provenance: unknown;
  evaluation: {
    evaluatorType: EvaluatorType;
    reliability: number;
    passed: boolean | null;
    attempt: {
      helpLevel: HelpLevel;
      taskVersion: {
        metadata: unknown;
        task: { kind: TaskKind };
      };
    };
  } | null;
};

export type CapabilityAttemptSource = {
  topicId: string;
  taskKind: TaskKind;
  metadata: unknown;
  rubric: unknown;
  helpLevel: HelpLevel;
  submittedAt: Date;
  evaluation: {
    evaluatorType: EvaluatorType;
    dimensionScores: unknown;
    rubricResult: unknown;
  } | null;
};

function validReliability(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : fallback;
}

function evaluatorFromProvenance(provenance: unknown): EvaluatorType {
  const value = objectValue(provenance).evaluator;
  return typeof value === 'string' && evaluatorTypeSet.has(value)
    ? (value as EvaluatorType)
    : 'MANUAL';
}

function capabilityFamilies(value: unknown): CapabilityFamily[] {
  return stringArray(value).filter((family): family is CapabilityFamily =>
    capabilityFamilySet.has(family),
  );
}

export function capabilityTaskMetadata(value: unknown): CapabilityTaskMetadataInput {
  const metadata = objectValue(value);
  return {
    sourceSchemaVersion: metadata.schemaVersion === '2.0' ? '2.0' : '1.0',
    evidenceFamilies: capabilityFamilies(metadata.evidenceFamilies),
    mixedEvidence: metadata.mixedEvidence === true,
  };
}

function dimensionFamilies(dimension: string): CapabilityFamily[] {
  if (capabilityFamilySet.has(dimension)) return [dimension as CapabilityFamily];
  if (!evidenceKindSet.has(dimension)) return [];
  return mapCapabilityFamilies({ evidenceKind: dimension as EvidenceKind });
}

function rubricDimensions(rubric: unknown): string[] {
  const dimensions = objectValue(objectValue(rubric).dimensions);
  return Object.entries(dimensions)
    .filter(([, weight]) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0)
    .map(([dimension]) => dimension)
    .sort();
}

function storedPendingDimensions(rubricResult: unknown): string[] | null {
  const coverage = objectValue(objectValue(rubricResult).coverage);
  return Array.isArray(coverage.pendingDimensions) ? stringArray(coverage.pendingDimensions) : null;
}

function pendingDimensions(source: CapabilityAttemptSource): string[] {
  const stored = storedPendingDimensions(source.evaluation?.rubricResult);
  if (stored !== null) return stored;
  if (!reviewableTaskKinds.has(source.taskKind)) return [];

  const dimensions = rubricDimensions(source.rubric);
  if (source.evaluation === null) return dimensions;
  if (!['EXACT_MATCH', 'TEST_RUNNER'].includes(source.evaluation.evaluatorType)) return [];

  const evaluated = new Set(Object.keys(objectValue(source.evaluation.dimensionScores)));
  return dimensions.filter((dimension) => !evaluated.has(dimension));
}

function pendingFamilies(
  dimensions: readonly string[],
  source: CapabilityAttemptSource,
  metadata: CapabilityTaskMetadataInput,
): CapabilityFamily[] {
  const direct = new Set(dimensions.flatMap(dimensionFamilies));
  if (metadata.sourceSchemaVersion !== '2.0')
    return CAPABILITY_FAMILIES.filter((family) => direct.has(family));

  const evaluatedFamilies = new Set(
    Object.keys(objectValue(source.evaluation?.dimensionScores)).flatMap(dimensionFamilies),
  );
  const hasUnmappedDimension = dimensions.some(
    (dimension) => dimensionFamilies(dimension).length === 0,
  );
  if (hasUnmappedDimension) {
    for (const family of metadata.evidenceFamilies) {
      if (!evaluatedFamilies.has(family)) direct.add(family);
    }
  }
  return CAPABILITY_FAMILIES.filter((family) => direct.has(family));
}

export function capabilityInputFromEvidence(
  source: CapabilityEvidenceSource,
  halfLifeDays: number,
): CapabilityEvidenceInput {
  const attempt = source.evaluation?.attempt;
  const evaluatorType =
    source.evaluation?.evaluatorType ?? evaluatorFromProvenance(source.provenance);
  const evaluatorReliability = validReliability(
    source.evaluation?.reliability ?? objectValue(source.provenance).reliability,
    DEFAULT_EVALUATOR_RELIABILITY[evaluatorType],
  );
  const families = mapCapabilityFamilies({ evidenceKind: source.kind });

  return {
    rawScore: source.rawScore,
    evaluatorType,
    evaluatorReliability,
    evidenceKind: source.kind,
    helpLevel: attempt?.helpLevel ?? 'NONE',
    occurredAt: source.occurredAt,
    halfLifeDays,
    ...(source.evaluation === null ? {} : { passed: source.evaluation.passed }),
    ...(attempt === undefined ? {} : { taskKind: attempt.taskVersion.task.kind }),
    ...(attempt === undefined
      ? {}
      : { taskMetadata: capabilityTaskMetadata(attempt.taskVersion.metadata) }),
    ...(families.length === 0 ? {} : { families }),
  };
}

export function pendingCapabilityInput(
  source: CapabilityAttemptSource,
  halfLifeDays: number,
): CapabilityEvidenceInput | null {
  const dimensions = pendingDimensions(source);
  if (dimensions.length === 0) return null;

  const metadata = capabilityTaskMetadata(source.metadata);
  const families = pendingFamilies(dimensions, source, metadata);
  const firstDimension = dimensions[0];
  const evidenceKind =
    firstDimension !== undefined && evidenceKindSet.has(firstDimension)
      ? (firstDimension as EvidenceKind)
      : 'EXPLANATION';

  return {
    pending: true,
    evaluatorType: source.evaluation?.evaluatorType ?? 'MANUAL',
    evidenceKind,
    helpLevel: source.helpLevel,
    occurredAt: source.submittedAt,
    halfLifeDays,
    taskKind: source.taskKind,
    taskMetadata: metadata,
    ...(families.length === 0 ? {} : { families }),
  };
}
