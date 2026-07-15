import type { LoadMode } from '@skillforge/contracts';

import { LEARNING_PHASES, SEQUENCE_LEARNING_PHASES } from './config.js';
import type { LearningPhase } from './types.js';

export type SequenceLearningPhase = (typeof SEQUENCE_LEARNING_PHASES)[number];

export type LearningSequenceStepInput =
  | {
      kind: 'CONTENT';
      contentItemKey: string;
      version: number;
    }
  | {
      kind: 'TASK';
      taskKey: string;
      version: number;
      purpose: string;
    };

export interface LearningSequenceCompletionRuleInput {
  requiredSteps: number;
  minimumNoHelpSuccesses: number;
}

export interface LearningSequenceBlueprintInput {
  schemaVersion: '1.0';
  key: string;
  version: number;
  topicKey: string;
  phase: LearningPhase;
  estimatedMinutes: number;
  steps: readonly LearningSequenceStepInput[];
  completionRule: LearningSequenceCompletionRuleInput;
}

export type LearningSequenceSnapshotStep =
  | Readonly<{
      kind: 'CONTENT';
      contentItemKey: string;
      version: number;
    }>
  | Readonly<{
      kind: 'TASK';
      taskKey: string;
      version: number;
      purpose: string;
    }>;

export interface LearningSequenceSnapshot {
  readonly schemaVersion: '1.0';
  readonly key: string;
  readonly version: number;
  readonly topicKey: string;
  readonly phase: SequenceLearningPhase;
  readonly estimatedMinutes: number;
  readonly steps: readonly LearningSequenceSnapshotStep[];
  readonly completionRule: Readonly<LearningSequenceCompletionRuleInput>;
}

export interface LearningSequenceBuildRequest {
  topicKey: string;
  phase: SequenceLearningPhase;
  loadMode: LoadMode;
  recentSequenceKeys: readonly string[];
  recommendedSequenceKey?: string;
}

const MACHINE_KEY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOAD_MODES: readonly LoadMode[] = ['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'];

function isSequenceLearningPhase(phase: LearningPhase): phase is SequenceLearningPhase {
  return (SEQUENCE_LEARNING_PHASES as readonly LearningPhase[]).includes(phase);
}

function assertMachineKey(value: string, label: string): void {
  if (!MACHINE_KEY_PATTERN.test(value)) {
    throw new RangeError(`${label} must be a stable English machine key`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

export function validateLearningSequenceBlueprint(blueprint: LearningSequenceBlueprintInput): void {
  if (blueprint.schemaVersion !== '1.0') {
    throw new RangeError('Learning sequence schemaVersion must be 1.0');
  }
  assertMachineKey(blueprint.key, 'key');
  assertPositiveInteger(blueprint.version, 'version');
  assertMachineKey(blueprint.topicKey, 'topicKey');
  if (!LEARNING_PHASES.includes(blueprint.phase)) {
    throw new RangeError('phase must be a known learning phase');
  }
  assertPositiveInteger(blueprint.estimatedMinutes, 'estimatedMinutes');
  if (blueprint.steps.length === 0) throw new RangeError('steps must not be empty');
  blueprint.steps.forEach((step, index) => {
    assertPositiveInteger(step.version, `steps[${String(index)}].version`);
    if (step.kind === 'CONTENT') {
      assertMachineKey(step.contentItemKey, `steps[${String(index)}].contentItemKey`);
    } else {
      assertMachineKey(step.taskKey, `steps[${String(index)}].taskKey`);
      if (step.purpose.trim().length === 0 || step.purpose.length > 80) {
        throw new RangeError(`steps[${String(index)}].purpose must contain 1-80 characters`);
      }
    }
  });
  assertPositiveInteger(blueprint.completionRule.requiredSteps, 'completionRule.requiredSteps');
  if (
    !Number.isSafeInteger(blueprint.completionRule.minimumNoHelpSuccesses) ||
    blueprint.completionRule.minimumNoHelpSuccesses < 0
  ) {
    throw new RangeError('completionRule.minimumNoHelpSuccesses must be a non-negative integer');
  }
  if (blueprint.completionRule.requiredSteps > blueprint.steps.length) {
    throw new RangeError('completionRule.requiredSteps cannot exceed steps length');
  }
}

function validateBuildRequest(request: LearningSequenceBuildRequest): void {
  assertMachineKey(request.topicKey, 'topicKey');
  if (!SEQUENCE_LEARNING_PHASES.includes(request.phase)) {
    throw new RangeError('phase must be ACQUISITION, CONSOLIDATION, or TRANSFER');
  }
  if (!LOAD_MODES.includes(request.loadMode)) throw new RangeError('loadMode is not supported');
  request.recentSequenceKeys.forEach((key, index) =>
    assertMachineKey(key, `recentSequenceKeys[${String(index)}]`),
  );
  if (request.recommendedSequenceKey !== undefined) {
    assertMachineKey(request.recommendedSequenceKey, 'recommendedSequenceKey');
  }
}

export function selectLearningSequenceBlueprint(
  blueprints: readonly LearningSequenceBlueprintInput[],
  request: LearningSequenceBuildRequest,
): LearningSequenceBlueprintInput | null {
  validateBuildRequest(request);
  blueprints.forEach(validateLearningSequenceBlueprint);
  let eligible = blueprints.filter(
    (blueprint) => blueprint.topicKey === request.topicKey && blueprint.phase === request.phase,
  );
  if (request.recommendedSequenceKey !== undefined) {
    eligible = eligible.filter((blueprint) => blueprint.key === request.recommendedSequenceKey);
    if (eligible.length === 0) return null;
  }

  const recent = new Set(request.recentSequenceKeys);
  const loadDifference = (
    left: LearningSequenceBlueprintInput,
    right: LearningSequenceBlueprintInput,
  ): number => {
    if (request.loadMode === 'MINIMAL' || request.loadMode === 'RETURN') {
      return left.estimatedMinutes - right.estimatedMinutes;
    }
    if (request.loadMode === 'DEEP') {
      return right.estimatedMinutes - left.estimatedMinutes;
    }
    return 0;
  };
  return (
    [...eligible].sort(
      (left, right) =>
        Number(recent.has(left.key)) - Number(recent.has(right.key)) ||
        loadDifference(left, right) ||
        left.key.localeCompare(right.key) ||
        right.version - left.version,
    )[0] ?? null
  );
}

export function createLearningSequenceSnapshot(
  blueprint: LearningSequenceBlueprintInput & { phase: SequenceLearningPhase },
): LearningSequenceSnapshot {
  validateLearningSequenceBlueprint(blueprint);
  const steps: readonly LearningSequenceSnapshotStep[] = Object.freeze(
    blueprint.steps.map((step) =>
      Object.freeze(
        step.kind === 'CONTENT'
          ? { kind: step.kind, contentItemKey: step.contentItemKey, version: step.version }
          : {
              kind: step.kind,
              taskKey: step.taskKey,
              version: step.version,
              purpose: step.purpose,
            },
      ),
    ),
  );
  const completionRule = Object.freeze({
    requiredSteps: blueprint.completionRule.requiredSteps,
    minimumNoHelpSuccesses: blueprint.completionRule.minimumNoHelpSuccesses,
  });
  return Object.freeze({
    schemaVersion: blueprint.schemaVersion,
    key: blueprint.key,
    version: blueprint.version,
    topicKey: blueprint.topicKey,
    phase: blueprint.phase,
    estimatedMinutes: blueprint.estimatedMinutes,
    steps,
    completionRule,
  });
}

export function buildLearningSequence(
  blueprints: readonly LearningSequenceBlueprintInput[],
  request: LearningSequenceBuildRequest,
): LearningSequenceSnapshot | null {
  const selected = selectLearningSequenceBlueprint(blueprints, request);
  if (selected === null) return null;
  if (!isSequenceLearningPhase(selected.phase)) {
    throw new RangeError('Selected blueprint phase is not supported by the session builder');
  }
  return createLearningSequenceSnapshot({ ...selected, phase: selected.phase });
}
