import { describe, expect, it } from 'vitest';

import {
  choiceScore,
  deterministicEvaluationResult,
  evaluationCoverage,
  exactOutputScore,
  pendingExternalReview,
  runnerScore,
} from '../src/modules/assessment/deterministic-evaluation.js';

describe('deterministic assessment evaluation', () => {
  it('uses the canonical selectedOptionIds contract independently of order', () => {
    expect(choiceScore(['b', 'a'], { selectedOptionIds: ['a', 'b'] })).toBe(100);
    expect(choiceScore(['a'], { selectedOptionIds: ['a', 'b'] })).toBe(0);
  });

  it('normalizes fenced and enumerated output without fuzzy matching', () => {
    expect(exactOutputScore('```text\n1. alpha\n2. beta\n```', { output: ['alpha', 'beta'] })).toBe(
      100,
    );
    expect(exactOutputScore('alpha\ngamma', { output: ['alpha', 'beta'] })).toBe(0);
  });

  it('preserves numeric output lines while still removing explicit list markers', () => {
    expect(exactOutputScore('2\ntrue', { output: ['2', 'true'] })).toBe(100);
    expect(exactOutputScore('1. 2\n2) true', { output: ['2', 'true'] })).toBe(100);
  });

  it('derives runner score only from protocol test results', () => {
    expect(
      runnerScore({
        requestId: 'run-1',
        status: 'failed',
        tests: [
          { name: 'one', passed: true },
          { name: 'two', passed: false },
        ],
        console: [],
        durationMs: 4,
      }),
    ).toBe(50);
    expect(
      runnerScore({
        requestId: 'run-2',
        status: 'timeout',
        tests: [],
        console: [],
        durationMs: 2_000,
      }),
    ).toBe(0);
  });

  it('keeps a predict-output explanation pending after deterministic output checking', () => {
    expect(pendingExternalReview('PREDICT_OUTPUT')).toBe(true);
    expect(pendingExternalReview('SINGLE_CHOICE')).toBe(false);
  });

  it('scores only the explicitly supported dimension of a mixed exact-match rubric', () => {
    const result = deterministicEvaluationResult({
      taskKind: 'PREDICT_OUTPUT',
      rubric: { dimensions: { PREDICT_OUTPUT: 70, EXPLANATION: 30 } },
      evaluatorType: 'EXACT_MATCH',
      evaluatorVersion: 'exact-match-v2.0',
      rawScore: 0,
    });

    expect(result).toMatchObject({
      score: null,
      passed: null,
      dimensionScores: { PREDICT_OUTPUT: 0 },
      coverage: {
        evaluatedDimensions: ['PREDICT_OUTPUT'],
        pendingDimensions: ['EXPLANATION'],
        unsupportedDimensions: [],
        isFinal: false,
      },
    });
  });

  it('marks a pure deterministic rubric as final', () => {
    const result = deterministicEvaluationResult({
      taskKind: 'PREDICT_OUTPUT',
      rubric: { dimensions: { PREDICT_OUTPUT: 100 } },
      evaluatorType: 'EXACT_MATCH',
      evaluatorVersion: 'exact-match-v2.0',
      rawScore: 100,
    });

    expect(result).toMatchObject({
      score: 100,
      passed: true,
      coverage: { isFinal: true },
    });
  });

  it('keeps a submitted free-text rubric pending without fabricating a zero', () => {
    expect(evaluationCoverage('EXPLAIN', { dimensions: { EXPLANATION: 80, RECALL: 20 } })).toEqual({
      evaluatedDimensions: [],
      pendingDimensions: ['EXPLANATION', 'RECALL'],
      unsupportedDimensions: [],
      isFinal: false,
    });
  });
});
