import { describe, expect, it } from 'vitest';

import {
  buildLearningSequence,
  selectLearningSequenceBlueprint,
  validateLearningSequenceBlueprint,
  type LearningSequenceBlueprintInput,
  type LearningSequenceSnapshotStep,
  type SequenceLearningPhase,
} from '../src/index.js';

function blueprint(
  overrides: Partial<LearningSequenceBlueprintInput> = {},
): LearningSequenceBlueprintInput {
  return {
    schemaVersion: '1.0',
    key: 'js.references.acquisition-v1',
    version: 1,
    topicKey: 'js.references',
    phase: 'ACQUISITION',
    estimatedMinutes: 20,
    steps: [
      {
        kind: 'CONTENT',
        contentItemKey: 'js.references.canonical-model',
        version: 1,
      },
      {
        kind: 'TASK',
        taskKey: 'js.references.predict-basic-001',
        version: 2,
        purpose: 'PREDICT',
      },
    ],
    completionRule: { requiredSteps: 2, minimumNoHelpSuccesses: 1 },
    ...overrides,
  };
}

describe('session sequence builder', () => {
  it.each([
    ['ACQUISITION', 'acquisition'],
    ['CONSOLIDATION', 'consolidation'],
    ['TRANSFER', 'transfer'],
  ] as const)('selects a versioned %s blueprint', (phase, suffix) => {
    const selected = buildLearningSequence(
      [
        blueprint({
          key: `js.references.${suffix}-v1`,
          phase,
        }),
      ],
      {
        topicKey: 'js.references',
        phase,
        loadMode: 'NORMAL',
        recentSequenceKeys: [],
      },
    );

    expect(selected).toMatchObject({ key: `js.references.${suffix}-v1`, phase, version: 1 });
  });

  it('honours an explicit sequence key and selects its latest version', () => {
    const selected = selectLearningSequenceBlueprint(
      [
        blueprint({ version: 1 }),
        blueprint({ version: 3 }),
        blueprint({ key: 'js.references.alternative-v1', version: 5 }),
      ],
      {
        topicKey: 'js.references',
        phase: 'ACQUISITION',
        loadMode: 'NORMAL',
        recentSequenceKeys: [],
        recommendedSequenceKey: 'js.references.acquisition-v1',
      },
    );

    expect(selected?.version).toBe(3);
  });

  it('avoids recently used sequences before applying load-fit and stable-key ordering', () => {
    const short = blueprint({
      key: 'js.references.a-short',
      estimatedMinutes: 10,
    });
    const medium = blueprint({
      key: 'js.references.b-medium',
      estimatedMinutes: 20,
    });
    const long = blueprint({
      key: 'js.references.c-long',
      estimatedMinutes: 40,
    });

    expect(
      selectLearningSequenceBlueprint([medium, long, short], {
        topicKey: 'js.references',
        phase: 'ACQUISITION',
        loadMode: 'MINIMAL',
        recentSequenceKeys: ['js.references.a-short'],
      })?.key,
    ).toBe('js.references.b-medium');
    expect(
      selectLearningSequenceBlueprint([medium, long, short], {
        topicKey: 'js.references',
        phase: 'ACQUISITION',
        loadMode: 'DEEP',
        recentSequenceKeys: [],
      })?.key,
    ).toBe('js.references.c-long');
  });

  it('returns null instead of inventing tasks when the requested blueprint is unavailable', () => {
    expect(
      buildLearningSequence([blueprint()], {
        topicKey: 'js.references',
        phase: 'ACQUISITION',
        loadMode: 'NORMAL',
        recentSequenceKeys: [],
        recommendedSequenceKey: 'js.references.missing-v1',
      }),
    ).toBeNull();
    expect(
      buildLearningSequence([], {
        topicKey: 'js.references',
        phase: 'TRANSFER',
        loadMode: 'NORMAL',
        recentSequenceKeys: [],
      }),
    ).toBeNull();
  });

  it('returns a deep-frozen copied snapshot with immutable versioned step refs', () => {
    const source = blueprint();
    const snapshot = buildLearningSequence([source], {
      topicKey: 'js.references',
      phase: 'ACQUISITION',
      loadMode: 'NORMAL',
      recentSequenceKeys: [],
    });
    if (snapshot === null) throw new Error('Expected a sequence snapshot');

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.steps)).toBe(true);
    expect(Object.isFrozen(snapshot.steps[0])).toBe(true);
    expect(Object.isFrozen(snapshot.completionRule)).toBe(true);
    expect(snapshot.steps).toEqual([
      {
        kind: 'CONTENT',
        contentItemKey: 'js.references.canonical-model',
        version: 1,
      },
      {
        kind: 'TASK',
        taskKey: 'js.references.predict-basic-001',
        version: 2,
        purpose: 'PREDICT',
      },
    ]);

    const sourceTask = source.steps[1];
    if (sourceTask?.kind !== 'TASK') throw new Error('Expected task step');
    sourceTask.version = 99;
    expect(snapshot.steps[1]?.version).toBe(2);
    const firstSnapshotStep = snapshot.steps[0];
    if (firstSnapshotStep === undefined) throw new Error('Expected snapshot step');
    expect(() =>
      (snapshot.steps as LearningSequenceSnapshotStep[]).push(firstSnapshotStep),
    ).toThrow(TypeError);
  });

  it('validates completion rules and does not accept unsupported builder phases', () => {
    expect(() =>
      validateLearningSequenceBlueprint(
        blueprint({ completionRule: { requiredSteps: 3, minimumNoHelpSuccesses: 1 } }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      buildLearningSequence([blueprint()], {
        topicKey: 'js.references',
        phase: 'CALIBRATION' as SequenceLearningPhase,
        loadMode: 'NORMAL',
        recentSequenceKeys: [],
      }),
    ).toThrow(RangeError);
  });
});
