import { describe, expect, it } from 'vitest';

import { EvaluationCoverageSchema, EvaluationResultV2Schema } from '../src/index.js';

describe('EvaluationCoverage', () => {
  it('represents partial evaluation without fabricating a final result', () => {
    const result = EvaluationResultV2Schema.parse({
      evaluatorType: 'exact-match',
      evaluatorVersion: '2.0.0',
      score: null,
      passed: null,
      dimensionScores: { output: 100 },
      coverage: {
        evaluatedDimensions: ['output'],
        pendingDimensions: ['explanation'],
        unsupportedDimensions: [],
        isFinal: false,
      },
      feedback: ['Полный итог появится после проверки объяснения.'],
    });

    expect(result.score).toBeNull();
    expect(result.passed).toBeNull();
    expect(result.coverage.isFinal).toBe(false);
  });

  it('rejects unknown coverage fields', () => {
    expect(() =>
      EvaluationCoverageSchema.parse({
        evaluatedDimensions: ['output'],
        pendingDimensions: [],
        unsupportedDimensions: [],
        isFinal: true,
        provisional: false,
      }),
    ).toThrow();
  });
});

describe('EvaluationResultV2', () => {
  const completeResult = {
    evaluatorType: 'exact-match',
    evaluatorVersion: '2.0.0',
    score: 100,
    passed: true,
    dimensionScores: { output: 100 },
    coverage: {
      evaluatedDimensions: ['output'],
      pendingDimensions: [],
      unsupportedDimensions: [],
      isFinal: true,
    },
    feedback: [],
  };

  it('rejects unknown result fields', () => {
    expect(() => EvaluationResultV2Schema.parse({ ...completeResult, mastery: 100 })).toThrow();
  });

  it('rejects scores outside the documented range', () => {
    expect(() => EvaluationResultV2Schema.parse({ ...completeResult, score: 101 })).toThrow();
    expect(() =>
      EvaluationResultV2Schema.parse({
        ...completeResult,
        dimensionScores: { output: -1 },
      }),
    ).toThrow();
  });
});
