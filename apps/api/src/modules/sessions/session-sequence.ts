import {
  buildLearningSequence,
  validateLearningSequenceBlueprint,
  type LearningPhase,
  type LearningSequenceBlueprintInput,
  type LearningSequenceBuildRequest,
  type LearningSequenceSnapshot,
  type LearningSequenceStepInput,
} from '@skillforge/learning-engine';

import { objectValue } from '../../common/json.js';

export type StoredLearningSequenceBlueprint = {
  id: string;
  key: string;
  version: number;
  topicKey: string;
  schemaVersion: string;
  phase: LearningPhase;
  estimatedMinutes: number;
  steps: unknown;
  completionRule: unknown;
  checksum: string;
  sourcePack: string;
  sourceVersion: string;
};

export type SelectedLearningSequence = {
  stored: StoredLearningSequenceBlueprint;
  snapshot: LearningSequenceSnapshot;
};

export type ContentPackSource = {
  key: string;
  version: string;
};

export type ActiveTaskVersionReference = {
  stableKey: string;
  version: number;
  sourcePack: string;
  sourceVersion: string;
};

export type ActiveContentItemReference = ActiveTaskVersionReference;

function sourceIdentity(key: string, version: string): string {
  return `${key}\u0000${version}`;
}

export function filterLearningSequencesByActiveSource(
  stored: readonly StoredLearningSequenceBlueprint[],
  activeSources: readonly ContentPackSource[],
): StoredLearningSequenceBlueprint[] {
  const active = new Set(activeSources.map((source) => sourceIdentity(source.key, source.version)));
  return stored.filter((sequence) =>
    active.has(sourceIdentity(sequence.sourcePack, sequence.sourceVersion)),
  );
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RangeError(`${label} must be a non-empty string`);
  }
  return value;
}

function sequenceStep(value: unknown, index: number): LearningSequenceStepInput {
  const step = objectValue(value);
  if (step.kind === 'CONTENT') {
    return {
      kind: 'CONTENT',
      contentItemKey: nonEmptyString(step.contentItemKey, `steps[${String(index)}].contentItemKey`),
      version: positiveInteger(step.version, `steps[${String(index)}].version`),
    };
  }
  if (step.kind === 'TASK') {
    return {
      kind: 'TASK',
      taskKey: nonEmptyString(step.taskKey, `steps[${String(index)}].taskKey`),
      version: positiveInteger(step.version, `steps[${String(index)}].version`),
      purpose: nonEmptyString(step.purpose, `steps[${String(index)}].purpose`),
    };
  }
  throw new RangeError(`steps[${String(index)}].kind is not supported`);
}

export function storedBlueprintInput(
  stored: StoredLearningSequenceBlueprint,
): LearningSequenceBlueprintInput {
  if (!Array.isArray(stored.steps)) throw new RangeError('steps must be an array');
  if (stored.schemaVersion !== '1.0') {
    throw new RangeError('Learning sequence schemaVersion must be 1.0');
  }
  const completionRule = objectValue(stored.completionRule);
  const blueprint: LearningSequenceBlueprintInput = {
    schemaVersion: stored.schemaVersion,
    key: stored.key,
    version: stored.version,
    topicKey: stored.topicKey,
    phase: stored.phase,
    estimatedMinutes: stored.estimatedMinutes,
    steps: stored.steps.map(sequenceStep),
    completionRule: {
      requiredSteps: positiveInteger(completionRule.requiredSteps, 'completionRule.requiredSteps'),
      minimumNoHelpSuccesses: nonNegativeInteger(
        completionRule.minimumNoHelpSuccesses,
        'completionRule.minimumNoHelpSuccesses',
      ),
    },
  };
  validateLearningSequenceBlueprint(blueprint);
  return blueprint;
}

function versionedReferenceIdentity(reference: ActiveTaskVersionReference): string {
  return `${reference.sourcePack}\u0000${reference.sourceVersion}\u0000${reference.stableKey}\u0000${String(reference.version)}`;
}

export function filterLearningSequencesByAvailableReferences(
  stored: readonly StoredLearningSequenceBlueprint[],
  references: {
    taskVersions: readonly ActiveTaskVersionReference[];
    contentItems: readonly ActiveContentItemReference[];
  },
): StoredLearningSequenceBlueprint[] {
  const activeTasks = new Set(references.taskVersions.map(versionedReferenceIdentity));
  const activeContent = new Set(references.contentItems.map(versionedReferenceIdentity));
  return stored.filter((sequence) => {
    const blueprint = storedBlueprintInput(sequence);
    return blueprint.steps.every((step) => {
      const reference = {
        stableKey: step.kind === 'TASK' ? step.taskKey : step.contentItemKey,
        version: step.version,
        sourcePack: sequence.sourcePack,
        sourceVersion: sequence.sourceVersion,
      };
      return (step.kind === 'TASK' ? activeTasks : activeContent).has(
        versionedReferenceIdentity(reference),
      );
    });
  });
}

export function selectStoredLearningSequence(
  stored: readonly StoredLearningSequenceBlueprint[],
  request: LearningSequenceBuildRequest,
): SelectedLearningSequence | null {
  const inputs = stored.map(storedBlueprintInput);
  const snapshot = buildLearningSequence(inputs, request);
  if (snapshot === null) return null;
  const selected = stored.find(
    (candidate) => candidate.key === snapshot.key && candidate.version === snapshot.version,
  );
  if (selected === undefined) throw new Error('Selected sequence row is missing');
  return { stored: selected, snapshot };
}

export function recentSequenceKey(planSnapshot: unknown): string | null {
  const sequence = objectValue(objectValue(planSnapshot).sequence);
  return typeof sequence.key === 'string' ? sequence.key : null;
}
